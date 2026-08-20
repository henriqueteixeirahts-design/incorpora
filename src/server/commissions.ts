import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { getEffectiveCommissionReleaseRule } from "@/server/commission-release-rules";
import type { CommissionSplit, Prisma } from "@/generated/prisma/client";

const BENEFICIARY_LABELS: Record<string, string> = {
  BROKER: "Corretor",
  AGENCY: "Imobiliária",
  COORDINATOR: "Coordenador",
  MANAGER: "Gerente",
  CAMPAIGN: "Campanha",
};

async function getOrCreateSupplierForBroker(tx: Prisma.TransactionClient, organizationId: string, brokerId: string) {
  const existing = await tx.supplier.findUnique({ where: { brokerId } });
  if (existing) return existing;

  const broker = await tx.broker.findUniqueOrThrow({ where: { id: brokerId } });
  return tx.supplier.create({
    data: {
      organizationId,
      brokerId,
      name: broker.name,
      document: broker.document,
      email: broker.email,
      phone: broker.phone,
    },
  });
}

async function getOrCreateSupplierForAgency(tx: Prisma.TransactionClient, organizationId: string, agencyId: string) {
  const existing = await tx.supplier.findUnique({ where: { agencyId } });
  if (existing) return existing;

  const agency = await tx.realEstateAgency.findUniqueOrThrow({ where: { id: agencyId } });
  return tx.supplier.create({
    data: { organizationId, agencyId, name: agency.name, document: agency.document },
  });
}

/**
 * Cria (find-or-create) o fornecedor e a conta a pagar da comissão liberada
 * — spec 4.2: "fornecedor = corretor/imobiliária... sem duplo lançamento
 * manual". Splits sem corretor/imobiliária vinculado (coordenador, gerente,
 * campanha — só têm `label` livre) ficam liberados mas sem Payable
 * automático: não há fornecedor cadastrado pra apontar, e inventar um a
 * partir de texto livre seria pior que deixar o Financeiro lançar à mão
 * nesse caso pontual.
 */
async function ensurePayableForReleasedSplit(
  tx: Prisma.TransactionClient,
  organizationId: string,
  developmentId: string,
  saleNumber: string,
  split: CommissionSplit,
) {
  if (split.payableId) return;

  let supplierId: string | null = null;
  if (split.brokerId) {
    supplierId = (await getOrCreateSupplierForBroker(tx, organizationId, split.brokerId)).id;
  } else if (split.agencyId) {
    supplierId = (await getOrCreateSupplierForAgency(tx, organizationId, split.agencyId)).id;
  }
  if (!supplierId) return;

  const payable = await tx.payable.create({
    data: {
      organizationId,
      developmentId,
      supplierId,
      category: "BROKERAGE",
      description: `Comissão — venda ${saleNumber} — ${BENEFICIARY_LABELS[split.beneficiaryType] ?? split.beneficiaryType}`,
      competenceDate: new Date(),
      dueDate: split.dueDate ?? new Date(),
      amount: split.value,
    },
  });

  await tx.commissionSplit.update({ where: { id: split.id }, data: { payableId: payable.id } });
}

/**
 * Avalia a regra de liberação do empreendimento contra o estado atual do
 * contrato e libera (PENDING -> RELEASED) os splits elegíveis, criando a
 * conta a pagar de cada um. Idempotente — chamar de novo sem nada ter
 * mudado não faz nada (só splits ainda PENDING são considerados).
 * `actorUserId` nulo é aceito (chamado a partir de fluxos automáticos como
 * o registro de recebimento, sem um usuário "decidindo" nada aqui).
 */
export async function tryReleaseCommissions(
  tx: Prisma.TransactionClient,
  organizationId: string,
  contractId: string,
  actorUserId: string | null,
) {
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    include: {
      sale: { include: { commissionSplits: true } },
      portfolio: { include: { installments: true } },
    },
  });
  if (!contract) return;

  const pendingSplits = contract.sale.commissionSplits.filter((s) => s.status === "PENDING");
  if (pendingSplits.length === 0) return;

  const rule = await getEffectiveCommissionReleaseRule(organizationId, contract.developmentId);
  const installments = contract.portfolio?.installments ?? [];

  let eligible = false;
  if (rule.trigger === "ON_CONTRACT_SIGNATURE") {
    eligible = contract.status === "SIGNED";
  } else if (rule.trigger === "ON_DOWN_PAYMENT_RECEIVED") {
    const downPaymentInstallment = installments.find((i) => i.isDownPayment);
    // Sem parcela de entrada na carteira (destino "direto ao corretor" já
    // excluiu ela, ou tabela sem entrada) — não há o que esperar receber,
    // libera na assinatura mesmo.
    eligible = downPaymentInstallment ? downPaymentInstallment.status === "PAID" : contract.status === "SIGNED";
  } else if (rule.trigger === "ON_INSTALLMENTS_PAID_PERCENT") {
    if (installments.length === 0) {
      eligible = contract.status === "SIGNED";
    } else {
      const paidCount = installments.filter((i) => i.status === "PAID").length;
      const percentPaid = (paidCount / installments.length) * 100;
      eligible = percentPaid >= rule.installmentsPaidPercent;
    }
  }

  if (!eligible) return;

  const releasedAt = new Date();
  for (const split of pendingSplits) {
    const updated = await tx.commissionSplit.update({
      where: { id: split.id },
      data: { status: "RELEASED", releasedAt },
    });

    await ensurePayableForReleasedSplit(tx, organizationId, contract.developmentId, contract.sale.saleNumber, updated);

    await recordAuditEvent(tx, {
      organizationId,
      actorUserId,
      action: "update",
      entityType: "CommissionSplit",
      entityId: split.id,
      beforeData: { status: "PENDING" },
      afterData: { status: "RELEASED" },
    });
  }

  await recordDevelopmentEvent(tx, {
    organizationId,
    developmentId: contract.developmentId,
    actorUserId,
    eventType: "commission.released",
    entityType: "Sale",
    entityId: contract.saleId,
    payload: { count: pendingSplits.length, trigger: rule.trigger },
  });
}

/**
 * Extrato consolidado por corretor/imobiliária (Fase A, Parte 4.2) — filtro
 * por parceiro + período, com os totais a liberar/liberadas/pagas que a
 * spec pede ("é o demonstrativo que se envia ao parceiro").
 */
export type CommissionStatementFilters = {
  brokerId?: string;
  agencyId?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export async function getCommissionStatement(organizationId: string, filters: CommissionStatementFilters) {
  const where: Prisma.CommissionSplitWhereInput = {
    sale: { organizationId },
    ...(filters.brokerId ? { brokerId: filters.brokerId } : {}),
    ...(filters.agencyId ? { agencyId: filters.agencyId } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          createdAt: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateTo ? { lte: filters.dateTo } : {}),
          },
        }
      : {}),
  };

  const splits = await prisma.commissionSplit.findMany({
    where,
    include: {
      sale: { include: { development: true, unit: true, customer: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totals = {
    pending: 0,
    released: 0,
    paid: 0,
  };
  for (const split of splits) {
    const value = Number(split.value);
    if (split.status === "PENDING") totals.pending += value;
    else if (split.status === "RELEASED") totals.released += value;
    else if (split.status === "PAID") totals.paid += value;
  }

  return { splits, totals };
}
