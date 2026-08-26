import "server-only";

import { prisma, type TransactionClient } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { getEffectiveCommissionReleaseRule } from "@/server/commission-release-rules";
import { getEffectiveCommissionRule } from "@/server/commission-rules";
import type { AccessContext } from "@/server/auth-context";
import type { CommissionSplit, Prisma } from "@/generated/prisma/client";

const BENEFICIARY_LABELS: Record<string, string> = {
  BROKER: "Corretor",
  AGENCY: "Imobiliária",
  COORDINATOR: "Coordenador",
  MANAGER: "Gerente",
  CAMPAIGN: "Campanha",
};

async function getOrCreateSupplierForBroker(tx: TransactionClient, organizationId: string, brokerId: string) {
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

async function getOrCreateSupplierForAgency(tx: TransactionClient, organizationId: string, agencyId: string) {
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
  tx: TransactionClient,
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
 *
 * Não valida escopo de empreendimento sozinha (não recebe `AccessContext` —
 * é chamada em cascata por `confirmSignature` (contracts.ts) e
 * `registerInstallmentPayment` (receivables.ts), sempre dentro da mesma
 * transação em que o CALLER já validou `canAccessDevelopment` pro contrato
 * em questão). Mesma convenção de `changeUnitStatusTx` em `units.ts`.
 */
export async function tryReleaseCommissions(
  tx: TransactionClient,
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

  // docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 4 — splits MANAGER (Natureza
  // 2, comissão interna) do empreendimento que já usa o modelo novo NUNCA
  // passam por este gatilho de liberação em lote: eles acumulam
  // proporcionalmente a cada parcela paga (src/server/commission-payment-
  // recognition.ts) e são consolidados num Payable periódico
  // (settleInternalCommissions), não liberados de uma vez aqui.
  const commissionRule = await getEffectiveCommissionRule(organizationId, contract.developmentId);
  const usesNewInternalModel = commissionRule.internalCommissionPercent !== null;

  const pendingSplits = contract.sale.commissionSplits.filter(
    (s) => s.status === "PENDING" && !(usesNewInternalModel && s.beneficiaryType === "MANAGER"),
  );
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
 * Comissão interna (Natureza 2) acumulada e ainda não liquidada, agrupada
 * por gerente — o que a Etapa 5 chama de "a liquidar" (accruedAmount -
 * settledAmount > 0 em qualquer CommissionSplit MANAGER dele, de qualquer
 * venda). Filtrado por `developmentAccess`, mesma convenção do resto do app.
 */
export async function listUnsettledInternalCommissions(context: AccessContext) {
  const splits = await prisma.commissionSplit.findMany({
    where: {
      beneficiaryType: "MANAGER",
      sale: {
        organizationId: context.organizationId,
        ...(context.developmentAccess === "ALL" ? {} : { developmentId: { in: [...context.developmentAccess] } }),
      },
    },
    include: { sale: { include: { development: true } } },
  });

  const byManager = new Map<string, { brokerId: string; unsettled: number; splitIds: string[] }>();
  for (const split of splits) {
    if (!split.brokerId) continue;
    const unsettled = round2(Number(split.accruedAmount) - Number(split.settledAmount));
    if (unsettled <= 0) continue;
    const entry = byManager.get(split.brokerId) ?? { brokerId: split.brokerId, unsettled: 0, splitIds: [] };
    entry.unsettled = round2(entry.unsettled + unsettled);
    entry.splitIds.push(split.id);
    byManager.set(split.brokerId, entry);
  }

  const brokerIds = [...byManager.keys()];
  const brokers = brokerIds.length
    ? await prisma.broker.findMany({ where: { id: { in: brokerIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(brokers.map((b) => [b.id, b.name]));

  return [...byManager.values()]
    .map((entry) => ({ ...entry, brokerName: nameById.get(entry.brokerId) ?? "?" }))
    .sort((a, b) => a.brokerName.localeCompare(b.brokerName, "pt-BR"));
}

/**
 * Liquidação consolidada da comissão interna (Natureza 2 — regime caixa,
 * mas SEM um Payable por parcela: consolida tudo que um gerente acumulou e
 * ainda não foi pra um pagamento, de todas as vendas dele, num Payable só).
 * Idempotente por delta — rodar duas vezes seguidas sem nada ter acumulado
 * a mais não cria um segundo Payable (soma dá 0, retorna cedo).
 */
export async function settleInternalCommissions(context: AccessContext, brokerId: string) {
  return prisma.$transaction(async (tx) => {
    const splits = await tx.commissionSplit.findMany({
      where: {
        beneficiaryType: "MANAGER",
        brokerId,
        sale: { organizationId: context.organizationId },
      },
      include: { sale: true },
    });

    const toSettle = splits
      .map((s) => ({ split: s, delta: round2(Number(s.accruedAmount) - Number(s.settledAmount)) }))
      .filter((s) => s.delta > 0);

    const total = round2(toSettle.reduce((sum, s) => sum + s.delta, 0));
    if (total <= 0) throw new Error("Não há comissão interna acumulada pra liquidar deste gerente.");

    const supplier = await getOrCreateSupplierForBroker(tx, context.organizationId, brokerId);

    // developmentId da Payable: só faz sentido quando todo o acumulado é do
    // mesmo empreendimento; gerente com acúmulo em N empreendimentos vira
    // uma Payable "da organização" (developmentId nulo), consistente com o
    // padrão já usado pra despesas administrativas.
    const developmentIds = new Set(toSettle.map((s) => s.split.sale.developmentId));
    const developmentId = developmentIds.size === 1 ? [...developmentIds][0] : null;

    const payable = await tx.payable.create({
      data: {
        organizationId: context.organizationId,
        developmentId,
        supplierId: supplier.id,
        category: "BROKERAGE",
        description: `Comissão interna — liquidação consolidada (${toSettle.length} venda(s))`,
        competenceDate: new Date(),
        dueDate: new Date(),
        amount: total,
      },
    });

    for (const { split, delta } of toSettle) {
      await tx.commissionSplit.update({ where: { id: split.id }, data: { settledAmount: Number(split.accruedAmount) } });
      await tx.commissionSplitPayable.create({ data: { splitId: split.id, payableId: payable.id, amount: delta } });
    }

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "Payable",
      entityId: payable.id,
      afterData: { ...payable, settledSplits: toSettle.length },
    });

    return payable;
  });
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
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

export async function getCommissionStatement(context: AccessContext, filters: CommissionStatementFilters) {
  const where: Prisma.CommissionSplitWhereInput = {
    sale: {
      organizationId: context.organizationId,
      ...(context.developmentAccess === "ALL" ? {} : { developmentId: { in: [...context.developmentAccess] } }),
    },
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
