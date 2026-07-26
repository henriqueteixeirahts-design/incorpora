import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { changeUnitStatusTx } from "@/server/units";
import type { AccessContext } from "@/server/auth-context";
import type { CommissionBeneficiaryType, Prisma } from "@/generated/prisma/client";

export function listSales(organizationId: string) {
  return prisma.sale.findMany({
    where: { organizationId },
    include: { unit: true, customer: true, development: true, commissionSplits: true },
    orderBy: { saleDate: "desc" },
  });
}

export type SaleSortField = "saleDate" | "salePrice" | "customer" | "development";

export async function listSalesPaged(
  organizationId: string,
  params: { search?: string; sortBy?: SaleSortField; sortDir?: "asc" | "desc"; page?: number; pageSize?: number },
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "saleDate";
  const sortDir = params.sortDir ?? "desc";
  const search = params.search?.trim();

  const where: Prisma.SaleWhereInput = {
    organizationId,
    ...(search
      ? {
          OR: [
            { customer: { name: { contains: search, mode: "insensitive" } } },
            { development: { name: { contains: search, mode: "insensitive" } } },
            { unit: { number: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.SaleOrderByWithRelationInput =
    sortBy === "customer"
      ? { customer: { name: sortDir } }
      : sortBy === "development"
        ? { development: { name: sortDir } }
        : { [sortBy]: sortDir };

  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { unit: true, customer: true, development: true, commissionSplits: true },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sale.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export function getSale(organizationId: string, saleId: string) {
  return prisma.sale.findFirst({
    where: { id: saleId, organizationId },
    include: {
      organization: true,
      unit: true,
      customer: true,
      development: { include: { spe: true } },
      proposal: { include: { broker: true, agency: true } },
      commissionSplits: true,
    },
  });
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
    if (!proposal) throw new Error("Proposta inválida.");
    if (proposal.status !== "APPROVED") throw new Error("Proposta precisa estar aprovada.");

    const sale = await tx.sale.create({
      data: {
        organizationId: context.organizationId,
        developmentId: proposal.developmentId,
        unitId: proposal.unitId,
        proposalId: proposal.id,
        customerId: proposal.customerId,
        salePrice: proposal.salePrice,
      },
    });

    if (proposal.commissionPercent && (proposal.brokerId || proposal.agencyId)) {
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

    const activeReservation = await tx.reservation.findFirst({
      where: { unitId: proposal.unitId, status: "ACTIVE" },
    });
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
    if (!sale) throw new Error("Venda inválida.");

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

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
