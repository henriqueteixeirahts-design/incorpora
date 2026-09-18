import "server-only";

import { prisma, type TransactionClient } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { calculateInstallment, startOfMonth, type CorrectionPhaseConfig } from "@/lib/index-correction";
import { simulateAnticipation } from "@/lib/anticipation";
import { tryReleaseCommissions } from "@/server/commissions";
import { recognizeCommissionOnPayment } from "@/server/commission-payment-recognition";
import { recognizeExchangePhysicalRepasseOnPayment, recognizeExchangeFinancialRepasseOnPayment } from "@/server/exchange-repasse";
import type { AccessContext } from "@/server/auth-context";
import { canAccessDevelopment } from "@/server/scope";
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
    if (!contract || !canAccessDevelopment(context, contract.developmentId)) throw new Error("Contrato inválido.");

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
    if (!development || !canAccessDevelopment(context, developmentId)) throw new Error("Empreendimento inválido.");

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

export function buildCorrectionPhases(contract: ContractWithIndexRule, development: DevelopmentWithPostHabiteSe) {
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
 *
 * Não valida escopo de empreendimento sozinha (não recebe `AccessContext` —
 * é uma função interna de transação, chamada em cascata por
 * `recalculatePortfolio`, `registerInstallmentPayment`,
 * `listOverdueInstallments`, `simulateInstallmentAnticipation` e pela rotina
 * agendada `recalculateAllOpenInstallments`). O CALLER precisa ter validado
 * `canAccessDevelopment`/`developmentAccessScope` antes de chamar — mesma
 * convenção de `changeUnitStatusTx` em `units.ts`.
 */
export async function recalculateInstallment(
  tx: TransactionClient,
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

  const competenceMonth = startOfMonth(asOfDate);
  const calculationData = {
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
  };

  // Upsert por (installmentId, competenceMonth): recálculo repetido no mesmo
  // mês de competência (reentrada do job, resumo pós-timeout) atualiza a
  // mesma linha em vez de duplicar histórico de auditoria — idempotência
  // exigida pela correção do recalculate-installments (RLS Pilar 2, Etapa 3).
  // Um novo mês de competência sempre cria uma linha nova (histórico entre
  // meses preservado).
  await tx.financialCalculation.upsert({
    where: { installmentId_competenceMonth: { installmentId, competenceMonth } },
    create: { installmentId, competenceMonth, ...calculationData },
    update: calculationData,
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

export async function recalculatePortfolio(context: AccessContext, portfolioId: string) {
  const portfolio = await prisma.receivablePortfolio.findFirst({
    where: { id: portfolioId, organizationId: context.organizationId },
    include: { installments: true, contract: true },
  });
  if (!portfolio || !canAccessDevelopment(context, portfolio.contract.developmentId)) {
    throw new Error("Carteira inválida.");
  }

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
    if (!installment || !canAccessDevelopment(context, installment.portfolio.contract.developmentId)) {
      throw new Error("Parcela inválida.");
    }
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

    const commissionRecognition = await recognizeCommissionOnPayment(tx, {
      installmentId,
      saleId: installment.portfolio.contract.saleId,
      paymentAmount: input.amount,
    });

    await tryReleaseCommissions(tx, context.organizationId, installment.portfolio.contract.id, context.userId);

    await recognizeExchangePhysicalRepasseOnPayment(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      unitId: installment.portfolio.contract.unitId,
      installmentPaymentId: payment.id,
      paymentAmount: input.amount,
      referenceDate: input.paidAt,
      externalCommissionAmount: commissionRecognition.externalRecognized,
      internalCommissionAmount: commissionRecognition.internalAccrued,
    });

    await recognizeExchangeFinancialRepasseOnPayment(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      developmentId: installment.portfolio.contract.developmentId,
      unitId: installment.portfolio.contract.unitId,
      installmentPaymentId: payment.id,
      paymentAmount: input.amount,
      referenceDate: input.paidAt,
    });

    return updated;
  });
}

// Concorrência do lote: pool efetivo de produção tem max_connections=60
// (Supabase, confirmado via pg_settings), compartilhado com tráfego real de
// usuário e outros jobs — 5 conexões simultâneas é uma fração pequena e
// conservadora desse limite, não o máximo teórico que caberia. Não elimina a
// necessidade do cursor: mesmo 5x de paralelismo não processa 1.500 parcelas
// sintéticas dentro de uma janela de 60s (medido no teste de volume), por
// isso o corte por orçamento de tempo abaixo é o mecanismo principal de
// segurança, não a velocidade do lote.
const RECALC_BATCH_CONCURRENCY = 5;

// Abaixo do `maxDuration = 60` das rotas de cron da Vercel (Hobby) — dá
// margem pra a última transação em andamento terminar e o cursor ser
// persistido antes da função ser morta por timeout.
const RECALC_TIME_BUDGET_MS = 50_000;

/**
 * Recalcula as parcelas em aberto da organização, em lotes concorrentes
 * limitados por `RECALC_BATCH_CONCURRENCY`, respeitando um orçamento de
 * tempo (`RECALC_TIME_BUDGET_MS`) — usado pela rotina diária agendada
 * (src/app/api/cron/recalculate-installments/route.ts, configurada em
 * vercel.json). Também é seguro chamar manualmente; parcelas já
 * pagas/canceladas são ignoradas por `recalculateInstallment`.
 *
 * `resumeAfterId`: id da última parcela processada numa execução anterior
 * incompleta (retomada via `JobRun.cursor`) — processamento continua a
 * partir da próxima parcela na mesma ordem estável (`id asc`), nunca
 * reprocessando o que já passou. `undefined`/`null` = começa do zero.
 *
 * Retorno: `cursor` não-nulo significa que o orçamento de tempo esgotou
 * antes de processar tudo — o caller (jobs.ts) persiste esse cursor e a
 * próxima invocação retoma dele; `cursor: null` significa que esta chamada
 * processou até o fim da lista de parcelas em aberto.
 */
export async function recalculateAllOpenInstallments(
  organizationId: string,
  resumeAfterId?: string | null,
) {
  const openInstallments = await prisma.installment.findMany({
    where: { portfolio: { organizationId }, status: { notIn: ["PAID", "CANCELLED"] } },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  const startIndex = resumeAfterId
    ? openInstallments.findIndex((installment) => installment.id === resumeAfterId) + 1
    : 0;
  const pending = openInstallments.slice(startIndex);

  const asOfDate = new Date();
  const deadline = Date.now() + RECALC_TIME_BUDGET_MS;
  let recalculated = 0;
  let cursor: string | null = null;

  for (let i = 0; i < pending.length; i += RECALC_BATCH_CONCURRENCY) {
    if (Date.now() >= deadline) {
      break;
    }

    const chunk = pending.slice(i, i + RECALC_BATCH_CONCURRENCY);
    await Promise.all(
      chunk.map((installment) =>
        prisma.$transaction((tx) => recalculateInstallment(tx, installment.id, asOfDate)),
      ),
    );
    recalculated += chunk.length;
    cursor = chunk[chunk.length - 1].id;
  }

  const fullyProcessed = startIndex + recalculated >= openInstallments.length;
  return { totalOpen: openInstallments.length, recalculated, cursor: fullyProcessed ? null : cursor };
}

/**
 * Varredura preguiçosa complementar à rotina mensal: garante que a tela de
 * inadimplência sempre mostra números atualizados mesmo entre execuções do
 * cron (ex.: alguém consultando no meio do mês).
 */
export async function listOverdueInstallments(context: AccessContext) {
  const developmentFilter =
    context.developmentAccess === "ALL"
      ? {}
      : { contract: { developmentId: { in: [...context.developmentAccess] } } };

  const openInstallments = await prisma.installment.findMany({
    where: {
      portfolio: { organizationId: context.organizationId, ...developmentFilter },
      status: { notIn: ["PAID", "CANCELLED"] },
      dueDate: { lt: new Date() },
    },
    include: { portfolio: { include: { contract: true } } },
  });

  for (const installment of openInstallments) {
    await prisma.$transaction((tx) => recalculateInstallment(tx, installment.id));
  }

  return prisma.installment.findMany({
    where: { portfolio: { organizationId: context.organizationId, ...developmentFilter }, status: "OVERDUE" },
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
  context: AccessContext,
  installmentIds: string[],
  discountPercent: number,
) {
  const installments = await prisma.installment.findMany({
    where: {
      id: { in: installmentIds },
      portfolio: { organizationId: context.organizationId },
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
  if (installments.some((i) => !canAccessDevelopment(context, i.portfolio.contract.developmentId))) {
    throw new Error("Selecione ao menos uma parcela em aberto.");
  }

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

/**
 * Posição "ao vivo" de uma parcela pro extrato do cliente (Fase B, Parte
 * 1.2) — cálculo puro, NUNCA persiste em `FinancialCalculation` (a função
 * `calculateInstallment` já não grava nada sozinha; aqui é onde
 * garantimos que também não chamamos `recalculateInstallment`, que grava).
 * Parcela paga: congela no valor já calculado no momento do recebimento
 * (`lastCalculatedAt` — quando `registerInstallmentPayment` chamou o
 * recálculo de verdade, esse sim persistido) — "na data do pagamento, se
 * paga", como pede a spec. Parcela cancelada: nunca corrigiu de verdade,
 * mostra só o valor nominal. Parcela em aberto: calcula na data de
 * referência pedida (hoje, por padrão, ou uma data futura pra simulação).
 */
export function getInstallmentLivePosition(
  installment: {
    status: string;
    originalValue: number;
    correctedValue: number | null;
    lastCalculatedAt: Date | null;
    dueDate: Date;
    correctionExempt?: boolean;
  },
  contract: ContractWithIndexRule & {
    signedAt: Date | null;
    issuedAt: Date;
    latePaymentFinePercent: Prisma.Decimal | number;
    latePaymentMonthlyInterestPercent: Prisma.Decimal | number;
  },
  development: DevelopmentWithPostHabiteSe,
  asOfDate: Date,
) {
  if (installment.status === "CANCELLED") {
    return {
      resultValue: installment.originalValue,
      correctedValue: installment.originalValue,
      fineAmount: 0,
      overdueInterestAmount: 0,
      daysOverdue: 0,
      details: null as ReturnType<typeof calculateInstallment>["details"] | null,
    };
  }

  const baseMonth = contract.signedAt ?? contract.issuedAt;
  const { habiteSeDate, preHabiteSe, postHabiteSe } = buildCorrectionPhases(contract, development);

  const effectiveAsOfDate = installment.status === "PAID" ? (installment.lastCalculatedAt ?? installment.dueDate) : asOfDate;

  // Parcela nascida de um acordo de renegociação "sem correção futura"
  // (Fase B, Parte 2.2) — não aplica índice/juros contratuais, mas
  // continua acumulando multa/mora normalmente se vencer (isso não é
  // "correção", é penalidade por atraso).
  const result = calculateInstallment({
    originalValue: installment.originalValue,
    baseMonth,
    dueDate: installment.dueDate,
    asOfDate: effectiveAsOfDate,
    habiteSeDate,
    preHabiteSe: installment.correctionExempt ? { indexValues: [], monthlyInterestPercent: 0 } : preHabiteSe,
    postHabiteSe: installment.correctionExempt ? null : postHabiteSe,
    latePaymentFinePercent: Number(contract.latePaymentFinePercent ?? 0),
    latePaymentMonthlyInterestPercent: Number(contract.latePaymentMonthlyInterestPercent ?? 0),
  });

  return {
    resultValue: result.resultValue,
    correctedValue: result.correctedValue,
    fineAmount: result.fineAmount,
    overdueInterestAmount: result.overdueInterestAmount,
    daysOverdue: result.daysOverdue,
    details: result.details,
  };
}

/**
 * "Simular quitação total na data X" (Fase B, Parte 1.2) — soma a posição
 * ao vivo (índice + juros + multa/mora, se a data cair após o vencimento)
 * de todas as parcelas ainda em aberto de um contrato, numa data de
 * referência escolhida. Puro/leitura — não persiste nada.
 */
export async function simulateFullSettlement(context: AccessContext, contractId: string, targetDate: Date) {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId: context.organizationId },
    include: {
      indexRule: { include: { values: true } },
      development: { include: { postHabiteSeIndexRule: { include: { values: true } } } },
      portfolio: { include: { installments: true } },
    },
  });
  if (!contract || !canAccessDevelopment(context, contract.developmentId)) throw new Error("Contrato inválido.");

  const openInstallments = (contract.portfolio?.installments ?? []).filter(
    (i) => i.status !== "PAID" && i.status !== "CANCELLED",
  );

  const items = openInstallments.map((installment) => {
    const position = getInstallmentLivePosition(
      {
        status: installment.status,
        originalValue: Number(installment.originalValue),
        correctedValue: installment.correctedValue ? Number(installment.correctedValue) : null,
        lastCalculatedAt: installment.lastCalculatedAt,
        dueDate: installment.dueDate,
      },
      contract,
      contract.development,
      targetDate,
    );
    return { installmentId: installment.id, label: installment.label, dueDate: installment.dueDate, ...position };
  });

  const total = items.reduce((sum, item) => sum + item.resultValue, 0);
  return { targetDate, items, total: Math.round(total * 100) / 100 };
}

export type { IndexCode };
