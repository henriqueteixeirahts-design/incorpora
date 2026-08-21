import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { changeUnitStatusTx } from "@/server/units";
import { resolveExternalSplitsForSale } from "@/server/commission-resolution";
import type { AccessContext } from "@/server/auth-context";
import { developmentAccessScope, canAccessDevelopment } from "@/server/scope";
import type { CommissionBeneficiaryType, DownPaymentDestination, Prisma } from "@/generated/prisma/client";

export function listSales(context: AccessContext) {
  return prisma.sale.findMany({
    where: { organizationId: context.organizationId, ...developmentAccessScope(context) },
    include: { unit: true, customer: true, development: true, commissionSplits: true },
    orderBy: { saleDate: "desc" },
  });
}

export type SaleSortField = "saleDate" | "salePrice" | "customer" | "development";
export type ContractStatusFilter = "NONE" | "DRAFT" | "AWAITING_SIGNATURE" | "SIGNED" | "CANCELLED";
export type WalletStatusFilter = "EM_DIA" | "INADIMPLENTE";

export type ListSalesFilters = {
  search?: string;
  sortBy?: SaleSortField;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  contractStatus?: ContractStatusFilter;
  brokerId?: string;
  agencyId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  walletStatus?: WalletStatusFilter;
};

/** "Em dia" ou "Inadimplente" (Fase A, Parte 3.1) — inadimplente = pelo menos uma parcela OVERDUE na carteira. Sem contrato/carteira ainda, retorna null (não é nem uma coisa nem outra). */
export function walletStatusFromInstallments(installments: { status: string }[] | undefined): WalletStatusFilter | null {
  if (!installments || installments.length === 0) return null;
  return installments.some((i) => i.status === "OVERDUE") ? "INADIMPLENTE" : "EM_DIA";
}

export async function listSalesPaged(context: AccessContext, params: ListSalesFilters) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "saleDate";
  const sortDir = params.sortDir ?? "desc";
  const search = params.search?.trim();

  const where: Prisma.SaleWhereInput = {
    organizationId: context.organizationId,
    ...developmentAccessScope(context),
    ...(search
      ? {
          OR: [
            { customer: { name: { contains: search, mode: "insensitive" } } },
            { development: { name: { contains: search, mode: "insensitive" } } },
            { unit: { number: { contains: search, mode: "insensitive" } } },
            { saleNumber: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(params.contractStatus === "NONE"
      ? { contract: null }
      : params.contractStatus
        ? { contract: { status: params.contractStatus } }
        : {}),
    ...(params.brokerId ? { proposal: { brokerId: params.brokerId } } : {}),
    ...(params.agencyId ? { proposal: { agencyId: params.agencyId } } : {}),
    ...(params.dateFrom || params.dateTo
      ? {
          saleDate: {
            ...(params.dateFrom ? { gte: params.dateFrom } : {}),
            ...(params.dateTo ? { lte: params.dateTo } : {}),
          },
        }
      : {}),
  };

  const orderBy: Prisma.SaleOrderByWithRelationInput =
    sortBy === "customer"
      ? { customer: { name: sortDir } }
      : sortBy === "development"
        ? { development: { name: sortDir } }
        : { [sortBy]: sortDir };

  const includeArgs = {
    unit: true,
    customer: true,
    development: true,
    commissionSplits: true,
    proposal: { include: { broker: true, agency: true } },
    contract: { include: { portfolio: { include: { installments: { select: { status: true } } } } } },
  } satisfies Prisma.SaleInclude;

  // Filtro de carteira precisa do status calculado, não dá pra empurrar pro
  // WHERE do banco (depende de agregar as parcelas) — busca tudo que bate
  // nos outros filtros e filtra em memória antes de paginar. Aceitável pro
  // volume de vendas de uma incorporadora (nunca são dezenas de milhares).
  if (params.walletStatus) {
    const all = await prisma.sale.findMany({ where, include: includeArgs, orderBy });
    const filtered = all.filter(
      (sale) => walletStatusFromInstallments(sale.contract?.portfolio?.installments) === params.walletStatus,
    );
    const total = filtered.length;
    const items = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    return { items, total, page, pageSize };
  }

  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: includeArgs,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sale.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getSale(context: AccessContext, saleId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, organizationId: context.organizationId },
    include: {
      organization: true,
      unit: true,
      customer: true,
      development: { include: { spe: true } },
      proposal: { include: { broker: true, agency: true, salesTable: true } },
      commissionSplits: true,
      reservation: true,
    },
  });
  if (!sale || !canAccessDevelopment(context, sale.developmentId)) return null;
  return sale;
}

async function nextSaleNumber(tx: Prisma.TransactionClient, organizationId: string) {
  const year = new Date().getFullYear();
  const count = await tx.sale.count({
    where: { organizationId, saleNumber: { startsWith: `V-${year}-` } },
  });
  return `V-${year}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * Converte uma proposta aprovada em venda (PRD seção 8). Move a unidade para
 * CONTRACT_IN_PROGRESS — a formalização do contrato em si é da Sprint 5.
 * Gera automaticamente um split de comissão de 100% para o corretor (ou
 * imobiliária, na ausência de corretor) quando a proposta tiver comissão e
 * beneficiário definidos; splits adicionais podem ser lançados depois.
 */
export async function convertProposalToSale(context: AccessContext, proposalId: string) {
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.findFirst({
      where: { id: proposalId, organizationId: context.organizationId },
      include: { unit: true },
    });
    if (!proposal || !canAccessDevelopment(context, proposal.developmentId)) throw new Error("Proposta inválida.");
    if (proposal.status !== "APPROVED") throw new Error("Proposta precisa estar aprovada.");

    const activeReservation = await tx.reservation.findFirst({
      where: { unitId: proposal.unitId, status: "ACTIVE" },
    });

    const saleNumber = await nextSaleNumber(tx, context.organizationId);

    const sale = await tx.sale.create({
      data: {
        organizationId: context.organizationId,
        developmentId: proposal.developmentId,
        unitId: proposal.unitId,
        proposalId: proposal.id,
        customerId: proposal.customerId,
        reservationId: activeReservation?.id,
        saleNumber,
        salePrice: proposal.salePrice,
      },
    });

    // docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 3/4 — quando o
    // empreendimento tem CommissionRule.externalCommissionPercent
    // configurado, a comissão externa passa a ser resolvida pelo motor de
    // split (ExternalCommissionSplit, nunca vira Payable) em vez do split
    // legado de 100% pro corretor/imobiliária (CommissionSplit, Fase A) —
    // substitui, não roda em paralelo (ver resolveExternalSplitsForSale).
    const resolvedExternalSplits = await resolveExternalSplitsForSale({
      organizationId: context.organizationId,
      developmentId: proposal.developmentId,
      salePrice: Number(proposal.salePrice),
      brokerId: proposal.brokerId,
      agencyId: proposal.agencyId,
    });

    if (resolvedExternalSplits) {
      for (const split of resolvedExternalSplits) {
        await tx.externalCommissionSplit.create({
          data: {
            saleId: sale.id,
            beneficiaryType: split.beneficiaryType,
            brokerId: split.brokerId,
            agencyId: split.agencyId,
            label: split.label,
            percent: split.percent,
            value: split.value,
          },
        });
      }
    } else if (proposal.commissionPercent && (proposal.brokerId || proposal.agencyId)) {
      const value = round2((Number(proposal.salePrice) * Number(proposal.commissionPercent)) / 100);
      await tx.commissionSplit.create({
        data: {
          saleId: sale.id,
          beneficiaryType: proposal.brokerId ? "BROKER" : "AGENCY",
          brokerId: proposal.brokerId,
          agencyId: proposal.agencyId,
          percent: proposal.commissionPercent,
          value,
        },
      });
    }

    await tx.proposal.update({ where: { id: proposalId }, data: { status: "CONVERTED" } });

    if (activeReservation) {
      await tx.reservation.update({
        where: { id: activeReservation.id },
        data: { status: "CONVERTED" },
      });
    }

    await changeUnitStatusTx(tx, {
      organizationId: context.organizationId,
      developmentId: proposal.developmentId,
      unitId: proposal.unitId,
      fromStatus: proposal.unit.status,
      toStatus: "CONTRACT_IN_PROGRESS",
      actorUserId: context.userId,
      reason: "Proposta convertida em venda",
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "Sale",
      entityId: sale.id,
      afterData: sale,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: proposal.developmentId,
      actorUserId: context.userId,
      eventType: "sale.completed",
      entityType: "Sale",
      entityId: sale.id,
      payload: { unitId: proposal.unitId, salePrice: Number(proposal.salePrice) },
    });

    return sale;
  });
}

export type AddCommissionSplitInput = {
  beneficiaryType: CommissionBeneficiaryType;
  brokerId?: string;
  agencyId?: string;
  label?: string;
  percent: number;
  dueDate?: Date;
};

export async function addCommissionSplit(
  context: AccessContext,
  saleId: string,
  input: AddCommissionSplitInput,
) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, organizationId: context.organizationId },
    });
    if (!sale || !canAccessDevelopment(context, sale.developmentId)) throw new Error("Venda inválida.");

    const value = round2((Number(sale.salePrice) * input.percent) / 100);

    const split = await tx.commissionSplit.create({
      data: {
        saleId,
        beneficiaryType: input.beneficiaryType,
        brokerId: input.brokerId,
        agencyId: input.agencyId,
        label: input.label,
        percent: input.percent,
        value,
        dueDate: input.dueDate,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "CommissionSplit",
      entityId: split.id,
      afterData: split,
    });

    return split;
  });
}

/**
 * Sobrescreve o destino da entrada definido na tabela de vendas, por venda
 * (docs/ESPEC_MODULO_COMERCIAL.md, Parte 4.2). Só tem efeito antes da
 * assinatura do contrato — depois disso a carteira já foi montada com o
 * destino vigente na hora (ver `confirmSignature` em src/server/contracts.ts).
 */
export async function setSaleDownPaymentDestinationOverride(
  context: AccessContext,
  saleId: string,
  destination: DownPaymentDestination | null,
) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: saleId, organizationId: context.organizationId } });
    if (!sale || !canAccessDevelopment(context, sale.developmentId)) throw new Error("Venda inválida.");

    const updated = await tx.sale.update({
      where: { id: saleId },
      data: { downPaymentDestinationOverride: destination },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Sale",
      entityId: saleId,
      beforeData: { downPaymentDestinationOverride: sale.downPaymentDestinationOverride },
      afterData: { downPaymentDestinationOverride: destination },
    });

    return updated;
  });
}

/**
 * Credita o gerente comercial interno (Natureza 2 —
 * docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 4) por esta venda
 * específica — obrigatório no modo PARTICIPATED_ONLY, sobrescreve o
 * gerente padrão (`CommissionRule.internalManagerBrokerId`) no modo
 * ALL_SALES. Só tem efeito antes da assinatura do contrato — depois disso o
 * split interno já foi resolvido (ver `confirmSignature`).
 */
export async function setSaleInternalManager(context: AccessContext, saleId: string, brokerId: string | null) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: saleId, organizationId: context.organizationId } });
    if (!sale || !canAccessDevelopment(context, sale.developmentId)) throw new Error("Venda inválida.");

    if (brokerId) {
      const manager = await tx.broker.findFirst({ where: { id: brokerId, organizationId: context.organizationId } });
      if (!manager) throw new Error("Gerente comercial interno inválido.");
      if (manager.role !== "MANAGER") throw new Error("O gerente comercial interno precisa ter papel de Gerente.");
    }

    const updated = await tx.sale.update({ where: { id: saleId }, data: { internalManagerBrokerId: brokerId } });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Sale",
      entityId: saleId,
      beforeData: { internalManagerBrokerId: sale.internalManagerBrokerId },
      afterData: { internalManagerBrokerId: brokerId },
    });

    return updated;
  });
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
