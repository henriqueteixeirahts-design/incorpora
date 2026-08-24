import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { developmentOwnedScope, canAccessDevelopment } from "@/server/scope";
import { calculatePhysicalRepasse, calculateFinancialEvent, applyValueCap, closeApurationPeriod as closeApurationPeriodCalc } from "@/lib/exchange-repasse";
import type { AccessContext } from "@/server/auth-context";
import type { Prisma } from "@/generated/prisma/client";

const REPASSE_ENTITY_TYPE = "ExchangeRepasse";
const RETENTION_RELEASE_ENTITY_TYPE = "ExchangeRetentionRelease";
const APURATION_PERIOD_ENTITY_TYPE = "ExchangeApurationPeriod";

/** Find-or-create — mesmo padrão de fornecedor=corretor/imobiliária/investidor já usado em commissions.ts/spe-investor-returns.ts. */
async function getOrCreateSupplierForPermutante(tx: Prisma.TransactionClient, organizationId: string, permutanteId: string) {
  const existing = await tx.supplier.findUnique({ where: { permutanteId } });
  if (existing) return existing;

  const permutante = await tx.permutante.findUniqueOrThrow({ where: { id: permutanteId } });
  return tx.supplier.create({
    data: {
      organizationId,
      permutanteId,
      name: permutante.name,
      document: permutante.document,
      email: permutante.email,
      phone: permutante.phone,
    },
  });
}

/**
 * Repasse de permuta física sob gestão (docs/ESPEC_PERMUTANTES.md, Etapa 3)
 * — chamado de dentro de `registerInstallmentPayment`
 * (src/server/receivables.ts), sempre na mesma transação do pagamento, logo
 * depois de `recognizeCommissionOnPayment` (cujos valores reconhecidos nesse
 * mesmo pagamento são reutilizados aqui, nunca recalculados). Só gera algo
 * quando a unidade da parcela está destacada num contrato PHYSICAL/MIXED sob
 * gestão do sistema (`managedBySystem = true`) — fora disso, a unidade nem
 * está no funil normal de vendas.
 */
export async function recognizeExchangePhysicalRepasseOnPayment(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    actorUserId: string | null;
    unitId: string;
    installmentPaymentId: string;
    paymentAmount: number;
    referenceDate: Date;
    externalCommissionAmount: number;
    internalCommissionAmount: number;
  },
) {
  const unit = await tx.unit.findUnique({
    where: { id: params.unitId },
    include: { exchangeContract: { include: { permutante: true } } },
  });
  const contract = unit?.exchangeContract;
  if (!contract) return null;
  if (contract.type === "FINANCIAL") return null;
  if (contract.managedBySystem !== true) return null;

  const calc = calculatePhysicalRepasse({
    paymentAmount: params.paymentAmount,
    administrationFeePct: contract.administrationFeePct ? Number(contract.administrationFeePct) : null,
    externalCommissionAmount: params.externalCommissionAmount,
    internalCommissionAmount: params.internalCommissionAmount,
    retentionPct: contract.retentionPct ? Number(contract.retentionPct) : null,
  });

  if (calc.grossBase <= 0) return null;

  const supplier = await getOrCreateSupplierForPermutante(tx, params.organizationId, contract.permutanteId);

  let payableId: string | null = null;
  if (calc.share > 0) {
    const payable = await tx.payable.create({
      data: {
        organizationId: params.organizationId,
        developmentId: contract.developmentId,
        supplierId: supplier.id,
        category: "EXCHANGE_REPASSE",
        description: `Repasse de permuta física — ${contract.permutante.name}`,
        competenceDate: params.referenceDate,
        dueDate: params.referenceDate,
        amount: calc.share,
      },
    });
    payableId = payable.id;
  }

  const repasse = await tx.exchangeRepasse.create({
    data: {
      exchangeContractId: contract.id,
      installmentPaymentId: params.installmentPaymentId,
      grossBase: calc.grossBase,
      administrationFeeAmount: calc.administrationFeeAmount,
      externalCommissionAmount: calc.externalCommissionAmount,
      internalCommissionAmount: calc.internalCommissionAmount,
      share: calc.share,
      payableId,
      referenceDate: params.referenceDate,
      details: calc,
    },
  });

  await recordAuditEvent(tx, {
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "create",
    entityType: REPASSE_ENTITY_TYPE,
    entityId: repasse.id,
    afterData: { ...repasse, payableId },
  });

  return repasse;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Período de apuração corrente do contrato (docs/ESPEC_PERMUTANTES.md,
 * Etapa 4) — MONTHLY_CONSOLIDATED usa 1 período por mês-calendário;
 * MILESTONES (e ON_RECEIPT com dedução manual habilitada) usa 1 único
 * período corrente, aberto até uma ação manual fechar.
 */
async function findOrCreateOpenApurationPeriod(
  tx: Prisma.TransactionClient,
  exchangeContractId: string,
  payoutFlow: "ON_RECEIPT" | "MONTHLY_CONSOLIDATED" | "MILESTONES",
  referenceDate: Date,
) {
  if (payoutFlow === "MONTHLY_CONSOLIDATED") {
    const periodStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const periodEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999);
    const existing = await tx.exchangeApurationPeriod.findFirst({
      where: { exchangeContractId, status: "OPEN", periodStart },
    });
    if (existing) return existing;
    return tx.exchangeApurationPeriod.create({ data: { exchangeContractId, periodStart, periodEnd, status: "OPEN" } });
  }

  const existing = await tx.exchangeApurationPeriod.findFirst({ where: { exchangeContractId, status: "OPEN" } });
  if (existing) return existing;
  return tx.exchangeApurationPeriod.create({
    data: { exchangeContractId, periodStart: referenceDate, periodEnd: referenceDate, status: "OPEN" },
  });
}

/**
 * Repasse de permuta financeira (docs/ESPEC_PERMUTANTES.md, Etapa 4) —
 * chamado de dentro de `registerInstallmentPayment`, mesma transação do
 * pagamento. Um empreendimento pode ter mais de um contrato financeiro
 * ativo (permutantes diferentes) — cada um gera seu próprio evento,
 * independente. Base sempre "recebido" (regime caixa, único modelo
 * suportado — decisão explícita do usuário).
 */
export async function recognizeExchangeFinancialRepasseOnPayment(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    actorUserId: string | null;
    developmentId: string;
    unitId: string;
    installmentPaymentId: string;
    paymentAmount: number;
    referenceDate: Date;
  },
) {
  const contracts = await tx.exchangeContract.findMany({
    where: {
      developmentId: params.developmentId,
      type: { in: ["FINANCIAL", "MIXED"] },
      status: "ACTIVE",
      financialTerms: { isNot: null },
    },
    include: { financialTerms: { include: { units: true } }, permutante: true },
  });

  const created = [];
  for (const contract of contracts) {
    const terms = contract.financialTerms;
    if (!terms) continue;
    if (terms.incidenceScope === "SPECIFIC_UNITS" && !terms.units.some((u) => u.unitId === params.unitId)) continue;

    const eventCalc = calculateFinancialEvent({
      paymentAmount: params.paymentAmount,
      administrationFeePct: contract.administrationFeePct ? Number(contract.administrationFeePct) : null,
      deductionBase: terms.deductionBase,
      percent: Number(terms.percent),
    });

    let share = eventCalc.share;
    if (terms.incidenceScope === "VALUE_CAP" && terms.incidenceCapValue) {
      const priorAgg = await tx.exchangeRepasse.aggregate({
        where: { exchangeContractId: contract.id },
        _sum: { share: true },
      });
      share = applyValueCap(share, Number(priorAgg._sum.share ?? 0), Number(terms.incidenceCapValue));
    }
    if (share <= 0) continue;

    const needsPeriod = terms.payoutFlow !== "ON_RECEIPT" || terms.deductCommission || terms.deductTax;

    let apurationPeriodId: string | null = null;
    let payableId: string | null = null;
    let retainedAmount = 0;

    if (needsPeriod) {
      const period = await findOrCreateOpenApurationPeriod(tx, contract.id, terms.payoutFlow, params.referenceDate);
      apurationPeriodId = period.id;
    } else {
      // ON_RECEIPT sem dedução manual habilitada — fecha na hora, só com retenção.
      retainedAmount = round2(share * ((terms.retentionPct ? Number(terms.retentionPct) : 0) / 100));
      const netAmount = round2(share - retainedAmount);
      if (netAmount > 0) {
        const supplier = await getOrCreateSupplierForPermutante(tx, params.organizationId, contract.permutanteId);
        const payable = await tx.payable.create({
          data: {
            organizationId: params.organizationId,
            developmentId: contract.developmentId,
            supplierId: supplier.id,
            category: "EXCHANGE_REPASSE",
            description: `Repasse de permuta financeira — ${contract.permutante.name}`,
            competenceDate: params.referenceDate,
            dueDate: params.referenceDate,
            amount: netAmount,
          },
        });
        payableId = payable.id;
      }
    }

    const repasse = await tx.exchangeRepasse.create({
      data: {
        exchangeContractId: contract.id,
        apurationPeriodId,
        installmentPaymentId: params.installmentPaymentId,
        grossBase: eventCalc.grossBase,
        administrationFeeAmount: eventCalc.administrationFeeAmount,
        share,
        payableId,
        referenceDate: params.referenceDate,
        details: { ...eventCalc, share, retainedAmount },
      },
    });

    await recordAuditEvent(tx, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: "create",
      entityType: REPASSE_ENTITY_TYPE,
      entityId: repasse.id,
      afterData: { ...repasse, payableId },
    });

    created.push(repasse);
  }

  return created;
}

async function getExchangeContractScoped(context: AccessContext, exchangeContractId: string) {
  const contract = await prisma.exchangeContract.findFirst({
    where: { id: exchangeContractId, ...developmentOwnedScope(context) },
    include: { permutante: true },
  });
  if (!contract || !canAccessDevelopment(context, contract.developmentId)) {
    throw new Error("Contrato de permuta não encontrado.");
  }
  return contract;
}

/**
 * Saldo retido disponível de um contrato — calculado ao vivo, nunca um
 * contador persistido (mesmo princípio do saldo devedor do mútuo). Duas
 * fontes: eventos que fecharam na hora sem passar por período (física, ou
 * financeira ON_RECEIPT sem dedução manual — `retainedAmount` fica dentro de
 * `details`) e períodos financeiros já fechados (`retainedAmount` é coluna
 * própria em ExchangeApurationPeriod).
 */
export async function getExchangeRetentionBalance(context: AccessContext, exchangeContractId: string) {
  await getExchangeContractScoped(context, exchangeContractId);

  const [directRepasses, closedPeriodsAgg, releasedAgg] = await Promise.all([
    prisma.exchangeRepasse.findMany({
      where: { exchangeContractId, apurationPeriodId: null },
      select: { details: true },
    }),
    prisma.exchangeApurationPeriod.aggregate({
      where: { exchangeContractId, status: "CLOSED" },
      _sum: { retainedAmount: true },
    }),
    prisma.exchangeRetentionRelease.aggregate({ where: { exchangeContractId }, _sum: { amount: true } }),
  ]);
  const totalRetainedDirect = directRepasses.reduce((sum, r) => {
    const details = r.details as { retainedAmount?: number };
    return sum + (details.retainedAmount ?? 0);
  }, 0);
  const totalRetainedPeriods = Number(closedPeriodsAgg._sum.retainedAmount ?? 0);
  const totalReleased = Number(releasedAgg._sum.amount ?? 0);

  return round2(totalRetainedDirect + totalRetainedPeriods - totalReleased);
}

/** Liberação de retenção (física ou financeira) — sempre ação manual, gera 1 Payable. */
export async function releaseExchangeRetention(
  context: AccessContext,
  exchangeContractId: string,
  input: { amount: number; releaseDate: Date; notes?: string },
) {
  const contract = await getExchangeContractScoped(context, exchangeContractId);
  const available = await getExchangeRetentionBalance(context, exchangeContractId);
  if (input.amount > available + 0.01) {
    throw new Error(`Valor de liberação (${input.amount.toFixed(2)}) excede o saldo retido disponível (${available.toFixed(2)}).`);
  }

  return prisma.$transaction(async (tx) => {
    const supplier = await getOrCreateSupplierForPermutante(tx, context.organizationId, contract.permutanteId);

    const payable = await tx.payable.create({
      data: {
        organizationId: context.organizationId,
        developmentId: contract.developmentId,
        supplierId: supplier.id,
        category: "EXCHANGE_RETENTION_RELEASE",
        description: `Liberação de retenção — ${contract.permutante.name}`,
        competenceDate: input.releaseDate,
        dueDate: input.releaseDate,
        amount: input.amount,
      },
    });

    const release = await tx.exchangeRetentionRelease.create({
      data: {
        exchangeContractId,
        amount: input.amount,
        releaseDate: input.releaseDate,
        payableId: payable.id,
        notes: input.notes,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: RETENTION_RELEASE_ENTITY_TYPE,
      entityId: release.id,
      afterData: { ...release, payable },
    });

    return release;
  });
}

export function listExchangeRepasses(context: AccessContext, exchangeContractId: string) {
  return getExchangeContractScoped(context, exchangeContractId).then(() =>
    prisma.exchangeRepasse.findMany({
      where: { exchangeContractId },
      orderBy: { referenceDate: "desc" },
    }),
  );
}

export function listExchangeRetentionReleases(context: AccessContext, exchangeContractId: string) {
  return getExchangeContractScoped(context, exchangeContractId).then(() =>
    prisma.exchangeRetentionRelease.findMany({
      where: { exchangeContractId },
      orderBy: { releaseDate: "desc" },
    }),
  );
}

async function getApurationPeriodScoped(context: AccessContext, periodId: string) {
  const period = await prisma.exchangeApurationPeriod.findFirst({
    where: { id: periodId, exchangeContract: { development: { organizationId: context.organizationId } } },
    include: { exchangeContract: { include: { permutante: true, financialTerms: true } } },
  });
  if (!period || !canAccessDevelopment(context, period.exchangeContract.developmentId)) {
    throw new Error("Período de apuração não encontrado.");
  }
  return period;
}

export function listApurationPeriods(context: AccessContext, exchangeContractId: string) {
  return getExchangeContractScoped(context, exchangeContractId).then(() =>
    prisma.exchangeApurationPeriod.findMany({
      where: { exchangeContractId },
      orderBy: { periodStart: "desc" },
      include: { repasses: true },
    }),
  );
}

/**
 * Fechamento manual de um período de apuração financeira — aplica dedução
 * de comissão/imposto (só quando habilitada no contrato, informada aqui
 * pelo Financeiro, com auditoria de quem/quando) e retenção, gera 1 Payable.
 * Nunca automático — mesmo princípio do fluxo "por marcos" e da liberação de
 * retenção: o sistema calcula, a decisão de fechar é sempre humana.
 */
export async function closeExchangeApurationPeriod(
  context: AccessContext,
  periodId: string,
  input: { commissionDeduction?: number; taxDeduction?: number },
) {
  const period = await getApurationPeriodScoped(context, periodId);
  if (period.status === "CLOSED") throw new Error("Este período já foi fechado.");
  const terms = period.exchangeContract.financialTerms;
  if (!terms) throw new Error("Contrato sem condições financeiras configuradas.");
  if (terms.deductCommission && input.commissionDeduction === undefined) {
    throw new Error("Informe o valor de comissão do período — dedução habilitada neste contrato.");
  }
  if (terms.deductTax && input.taxDeduction === undefined) {
    throw new Error("Informe o valor de imposto do período — dedução habilitada neste contrato.");
  }

  const grossAggregate = await prisma.exchangeRepasse.aggregate({
    where: { apurationPeriodId: periodId },
    _sum: { share: true },
  });
  const grossAccrued = Number(grossAggregate._sum.share ?? 0);

  const closure = closeApurationPeriodCalc({
    grossAccrued,
    commissionDeduction: terms.deductCommission ? (input.commissionDeduction ?? 0) : null,
    taxDeduction: terms.deductTax ? (input.taxDeduction ?? 0) : null,
    retentionPct: terms.retentionPct ? Number(terms.retentionPct) : null,
  });

  return prisma.$transaction(async (tx) => {
    let payableId: string | null = null;
    if (closure.netAmount > 0) {
      const supplier = await getOrCreateSupplierForPermutante(tx, context.organizationId, period.exchangeContract.permutanteId);
      const payable = await tx.payable.create({
        data: {
          organizationId: context.organizationId,
          developmentId: period.exchangeContract.developmentId,
          supplierId: supplier.id,
          category: "EXCHANGE_REPASSE",
          description: `Repasse de permuta financeira — ${period.exchangeContract.permutante.name}`,
          competenceDate: period.periodEnd,
          dueDate: period.periodEnd,
          amount: closure.netAmount,
        },
      });
      payableId = payable.id;
    }

    const updated = await tx.exchangeApurationPeriod.update({
      where: { id: periodId },
      data: {
        status: "CLOSED",
        commissionDeduction: terms.deductCommission ? input.commissionDeduction : null,
        taxDeduction: terms.deductTax ? input.taxDeduction : null,
        deductionsInformedByUserId: terms.deductCommission || terms.deductTax ? context.userId : null,
        deductionsInformedAt: terms.deductCommission || terms.deductTax ? new Date() : null,
        retainedAmount: closure.retainedAmount,
        netAmount: closure.netAmount,
        payableId,
        closedAt: new Date(),
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: APURATION_PERIOD_ENTITY_TYPE,
      entityId: periodId,
      beforeData: { status: period.status },
      afterData: { ...updated, payableId },
    });

    return updated;
  });
}
