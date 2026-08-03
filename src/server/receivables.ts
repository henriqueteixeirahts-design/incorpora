import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { calculateInstallment, type CorrectionPhaseConfig } from "@/lib/index-correction";
import { simulateAnticipation } from "@/lib/anticipation";
import { tryReleaseCommissions } from "@/server/commissions";
import type { AccessContext } from "@/server/auth-context";
import type { IndexCode, InterestType, Prisma } from "@/generated/prisma/client";

export type SetCorrectionRuleInput = {
  indexRuleId?: string | null;
  monthlyInterestPercent?: number | null;
  interestType?: InterestType;
  latePaymentFinePercent?: number;
  latePaymentMonthlyInterestPercent?: number;
};

export async function setContractCorrectionRule(
  context: AccessContext,
  contractId: string,
  input: SetCorrectionRuleInput,
) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findFirst({
      where: { id: contractId, organizationId: context.organizationId },
    });
    if (!contract) throw new Error("Contrato inválido.");

    const updated = await tx.contract.update({
      where: { id: contractId },
      data: {
        indexRuleId: input.indexRuleId,
        monthlyInterestPercent: input.monthlyInterestPercent,
        interestType: input.interestType,
        latePaymentFinePercent: input.latePaymentFinePercent,
        latePaymentMonthlyInterestPercent: input.latePaymentMonthlyInterestPercent,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Contract",
      entityId: contractId,
      afterData: input,
    });

    return updated;
  });
}

export type SetDevelopmentCorrectionRuleInput = {
  habiteSeDate?: Date | null;
  postHabiteSeIndexRuleId?: string | null;
  postHabiteSeMonthlyInterestPercent?: number | null;
  postHabiteSeInterestType?: InterestType;
};

/**
 * Regra de correção pós-Habite-se — cadastrada no empreendimento, vale para
 * todos os contratos dele (confirmado pela TSH: não é por contrato).
 */
export async function setDevelopmentCorrectionRule(
  context: AccessContext,
  developmentId: string,
  input: SetDevelopmentCorrectionRuleInput,
) {
  return prisma.$transaction(async (tx) => {
    const development = await tx.development.findFirst({
      where: { id: developmentId, organizationId: context.organizationId },
    });
    if (!development) throw new Error("Empreendimento inválido.");

    const updated = await tx.development.update({
      where: { id: developmentId },
      data: {
        habiteSeDate: input.habiteSeDate,
        postHabiteSeIndexRuleId: input.postHabiteSeIndexRuleId,
        postHabiteSeMonthlyInterestPercent: input.postHabiteSeMonthlyInterestPercent,
        postHabiteSeInterestType: input.postHabiteSeInterestType,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Development",
      entityId: developmentId,
      afterData: input,
    });

    return updated;
  });
}

type ContractWithIndexRule = {
  indexRuleId: string | null;
  monthlyInterestPercent: Prisma.Decimal | null;
  interestType: InterestType;
  indexRule: { values: { referenceMonth: Date; ratePercent: Prisma.Decimal }[] } | null;
};

type DevelopmentWithPostHabiteSe = {
  habiteSeDate: Date | null;
  postHabiteSeMonthlyInterestPercent: Prisma.Decimal | null;
  postHabiteSeInterestType: InterestType;
  postHabiteSeIndexRule: { values: { referenceMonth: Date; ratePercent: Prisma.Decimal }[] } | null;
};

function buildCorrectionPhases(contract: ContractWithIndexRule, development: DevelopmentWithPostHabiteSe) {
  const preHabiteSe: CorrectionPhaseConfig = {
    indexValues: (contract.indexRule?.values ?? []).map((v) => ({
      referenceMonth: v.referenceMonth,
      ratePercent: Number(v.ratePercent),
    })),
    monthlyInterestPercent: contract.monthlyInterestPercent ? Number(contract.monthlyInterestPercent) : null,
    interestType: contract.interestType,
  };

  const postHabiteSe: CorrectionPhaseConfig | null = development.postHabiteSeIndexRule
    ? {
        indexValues: development.postHabiteSeIndexRule.values.map((v) => ({
          referenceMonth: v.referenceMonth,
          ratePercent: Number(v.ratePercent),
        })),
        monthlyInterestPercent: development.postHabiteSeMonthlyInterestPercent
          ? Number(development.postHabiteSeMonthlyInterestPercent)
          : null,
        interestType: development.postHabiteSeInterestType,
      }
    : null;

  return { habiteSeDate: development.habiteSeDate, preHabiteSe, postHabiteSe };
}

/**
 * Recalcula uma parcela na data de referência informada (padrão: hoje) e
 * grava o resultado em FinancialCalculation — nunca sobrescreve cálculos
 * anteriores, só acrescenta (PRD seção 12: memória de cálculo auditável).
 */
export async function recalculateInstallment(
  tx: Prisma.TransactionClient,
  installmentId: string,
  asOfDate: Date = new Date(),
) {
  const installment = await tx.installment.findUniqueOrThrow({
    where: { id: installmentId },
    include: {
      portfolio: {
        include: {
          contract: {
            include: {
              indexRule: { include: { values: true } },
              development: { include: { postHabiteSeIndexRule: { include: { values: true } } } },
            },
          },
        },
      },
      payments: true,
    },
  });

  if (installment.status === "PAID" || installment.status === "CANCELLED") {
    return installment;
  }

  const contract = installment.portfolio.contract;
  const baseMonth = contract.signedAt ?? contract.issuedAt;
  const { habiteSeDate, preHabiteSe, postHabiteSe } = buildCorrectionPhases(
    contract,
    contract.development,
  );

  const result = calculateInstallment({
    originalValue: Number(installment.originalValue),
    baseMonth,
    dueDate: installment.dueDate,
    asOfDate,
    habiteSeDate,
    preHabiteSe,
    postHabiteSe,
    latePaymentFinePercent: Number(contract.latePaymentFinePercent),
    latePaymentMonthlyInterestPercent: Number(contract.latePaymentMonthlyInterestPercent),
  });

  await tx.financialCalculation.create({
    data: {
      installmentId,
      asOfDate,
      baseValue: result.baseValue,
      indexFactor: result.indexFactor,
      interestFactor: result.interestFactor,
      correctedValue: result.correctedValue,
      daysOverdue: result.daysOverdue,
      fineAmount: result.fineAmount,
      overdueInterestAmount: result.overdueInterestAmount,
      resultValue: result.resultValue,
      details: result.details as unknown as Prisma.InputJsonValue,
    },
  });

  const paidAmount = Number(installment.paidAmount);
  const isFullyPaid = paidAmount >= result.resultValue - 0.01;
  const status = isFullyPaid
    ? "PAID"
    : paidAmount > 0
      ? "PARTIALLY_PAID"
      : result.daysOverdue > 0
        ? "OVERDUE"
        : "PENDING";

  return tx.installment.update({
    where: { id: installmentId },
    data: { correctedValue: result.resultValue, lastCalculatedAt: asOfDate, status },
  });
}

export async function recalculatePortfolio(organizationId: string, portfolioId: string) {
  const portfolio = await prisma.receivablePortfolio.findFirst({
    where: { id: portfolioId, organizationId },
    include: { installments: true },
  });
  if (!portfolio) throw new Error("Carteira inválida.");

  const asOfDate = new Date();
  for (const installment of portfolio.installments) {
    if (installment.status === "PAID" || installment.status === "CANCELLED") continue;
    await prisma.$transaction((tx) => recalculateInstallment(tx, installment.id, asOfDate));
  }
}

export type RegisterPaymentInput = {
  amount: number;
  paidAt: Date;
  method?: string;
  notes?: string;
};

export async function registerInstallmentPayment(
  context: AccessContext,
  installmentId: string,
  input: RegisterPaymentInput,
) {
  return prisma.$transaction(async (tx) => {
    const installment = await tx.installment.findFirst({
      where: { id: installmentId, portfolio: { organizationId: context.organizationId } },
      include: { portfolio: { include: { contract: true } } },
    });
    if (!installment) throw new Error("Parcela inválida.");
    if (installment.status === "CANCELLED") throw new Error("Parcela cancelada.");

    // Recalcula antes de registrar o recebimento, para comparar contra o valor corrigido atual.
    await recalculateInstallment(tx, installmentId, input.paidAt);

    const payment = await tx.installmentPayment.create({
      data: {
        installmentId,
        amount: input.amount,
        paidAt: input.paidAt,
        method: input.method,
        notes: input.notes,
        createdByUserId: context.userId,
      },
    });

    const totalPaid = await tx.installmentPayment.aggregate({
      where: { installmentId },
      _sum: { amount: true },
    });
    const paidAmount = Number(totalPaid._sum.amount ?? 0);

    const current = await tx.installment.findUniqueOrThrow({ where: { id: installmentId } });
    const targetValue = Number(current.correctedValue ?? current.originalValue);
    const status = paidAmount >= targetValue - 0.01 ? "PAID" : "PARTIALLY_PAID";

    const updated = await tx.installment.update({
      where: { id: installmentId },
      data: { paidAmount, status },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "InstallmentPayment",
      entityId: payment.id,
      afterData: payment,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: installment.portfolio.contract.developmentId,
      actorUserId: context.userId,
      eventType: "installment.paid",
      entityType: "Installment",
      entityId: installmentId,
      payload: { amount: input.amount, status },
    });

    await tryReleaseCommissions(tx, context.organizationId, installment.portfolio.contract.id, context.userId);

    return updated;
  });
}

/**
 * Recalcula todas as parcelas em aberto da organização — usado pela rotina
 * mensal agendada (src/app/api/cron/recalculate-installments/route.ts,
 * configurada em vercel.json). Também é seguro chamar manualmente; parcelas
 * já pagas/canceladas são ignoradas por `recalculateInstallment`.
 */
export async function recalculateAllOpenInstallments(organizationId: string) {
  const openInstallments = await prisma.installment.findMany({
    where: { portfolio: { organizationId }, status: { notIn: ["PAID", "CANCELLED"] } },
    select: { id: true },
  });

  const asOfDate = new Date();
  let recalculated = 0;
  for (const installment of openInstallments) {
    await prisma.$transaction((tx) => recalculateInstallment(tx, installment.id, asOfDate));
    recalculated += 1;
  }

  return { totalOpen: openInstallments.length, recalculated };
}

/**
 * Varredura preguiçosa complementar à rotina mensal: garante que a tela de
 * inadimplência sempre mostra números atualizados mesmo entre execuções do
 * cron (ex.: alguém consultando no meio do mês).
 */
export async function listOverdueInstallments(organizationId: string) {
  const openInstallments = await prisma.installment.findMany({
    where: {
      portfolio: { organizationId },
      status: { notIn: ["PAID", "CANCELLED"] },
      dueDate: { lt: new Date() },
    },
    include: { portfolio: { include: { contract: true } } },
  });

  for (const installment of openInstallments) {
    await prisma.$transaction((tx) => recalculateInstallment(tx, installment.id));
  }

  return prisma.installment.findMany({
    where: { portfolio: { organizationId }, status: "OVERDUE" },
    include: {
      portfolio: {
        include: {
          contract: { include: { customer: true, unit: true, development: true } },
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });
}

export async function simulateInstallmentAnticipation(
  organizationId: string,
  installmentIds: string[],
  discountPercent: number,
) {
  const installments = await prisma.installment.findMany({
    where: {
      id: { in: installmentIds },
      portfolio: { organizationId },
      status: { notIn: ["PAID", "CANCELLED"] },
    },
    include: {
      portfolio: {
        include: {
          contract: {
            include: {
              indexRule: { include: { values: true } },
              development: { include: { postHabiteSeIndexRule: { include: { values: true } } } },
            },
          },
        },
      },
    },
  });
  if (installments.length === 0) throw new Error("Selecione ao menos uma parcela em aberto.");

  const contract = installments[0].portfolio.contract;
  const baseMonth = contract.signedAt ?? contract.issuedAt;
  const { habiteSeDate, preHabiteSe, postHabiteSe } = buildCorrectionPhases(
    contract,
    contract.development,
  );

  return simulateAnticipation({
    installments: installments.map((i) => ({
      installmentId: i.id,
      label: i.label,
      originalValue: Number(i.originalValue),
      dueDate: i.dueDate,
    })),
    baseMonth,
    asOfDate: new Date(),
    habiteSeDate,
    preHabiteSe,
    postHabiteSe,
    discountPercent,
  });
}

export type { IndexCode };
