import "server-only";

import { prisma } from "@/lib/prisma";
import { resolvePayableDestinations } from "@/server/payable-allocations";
import { getOpeningBalanceTotal } from "@/server/bank-accounts";
import { periodKey, type CashFlowGranularity } from "@/lib/cash-flow-period";

export type { CashFlowGranularity } from "@/lib/cash-flow-period";

export type CashFlowBucket = {
  period: string; // "YYYY-MM" | "YYYY-Www" | "YYYY-MM-DD", conforme a granularidade
  receivablesForecast: number; // carteira (corrigida) + recebíveis avulsos, por vencimento
  receivablesRealized: number; // recebimentos efetivos (carteira + avulsos), por data do recebimento
  payablesForecast: number; // contas a pagar (com rateio aplicado), por vencimento
  payablesRealized: number; // pagamentos efetivos, por data do pagamento
  netForecast: number;
  netRealized: number;
  variance: number; // netRealized - netForecast: o quanto o realizado já destoou do previsto
  cumulativeForecast: number; // saldo acumulado projetado, partindo do saldo inicial bancário
  cumulativeRealized: number; // saldo acumulado realizado, partindo do mesmo saldo inicial
};

/** @deprecated use CashFlowBucket — mantido só pelo nome, mesma forma. */
export type CashFlowMonth = CashFlowBucket;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type CashFlowOptions = {
  developmentId?: string;
  speId?: string;
  granularity?: CashFlowGranularity;
  monthsBack?: number; // usado quando granularity="monthly" (default)
  monthsForward?: number;
  daysBack?: number; // usado quando granularity="weekly"|"daily"
  daysForward?: number;
  includeOpeningBalance?: boolean; // default true — soma o saldo inicial bancário do escopo
};

/**
 * Fluxo de caixa consolidado (Fase B, Parte 4.4) — soma três fontes sem
 * duplicar dados: a carteira a receber (Installment, corrigida), os
 * recebíveis avulsos (Receivable, Parte 4.3) e as contas a pagar (Payable,
 * com rateio aplicado via `resolvePayableDestinations`, Parte 4.2). Cada
 * fonte é somada por período de vencimento (previsto) e por período do
 * lançamento efetivo (realizado) — granularidade mensal, semanal ou diária,
 * todas geradas pela mesma varredura dia a dia do intervalo (garante que
 * todo período apareça, mesmo sem movimento).
 */
export async function getCashFlow(organizationId: string, options: CashFlowOptions = {}): Promise<CashFlowBucket[]> {
  const granularity = options.granularity ?? "monthly";
  const today = new Date();

  let rangeStart: Date;
  let rangeEnd: Date;
  if (granularity === "monthly") {
    const monthsBack = options.monthsBack ?? 2;
    const monthsForward = options.monthsForward ?? 6;
    rangeStart = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
    rangeEnd = new Date(today.getFullYear(), today.getMonth() + monthsForward + 1, 0);
  } else {
    const daysBack = options.daysBack ?? (granularity === "daily" ? 7 : 14);
    const daysForward = options.daysForward ?? (granularity === "daily" ? 14 : 42);
    rangeStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysBack);
    rangeEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysForward);
  }
  // `dueDate`/`paidAt`/`receivedAt` carregam hora (ex.: "agora"), não só a
  // data — sem isso, um lançamento de hoje à tarde ficaria de fora de um
  // range que termina hoje à meia-noite.
  rangeEnd.setHours(23, 59, 59, 999);

  // Filtro por SPE resolve pro conjunto de empreendimentos daquela SPE —
  // Installment/Payable/Receivable não têm um atalho de speId consistente
  // em toda a cadeia (carteira só chega em SPE via Contract.development),
  // então "filtrar por SPE" concretamente significa "empreendimentos
  // daquela SPE, mais lançamentos avulsos com esse speId direto".
  let developmentIds: string[] | undefined;
  if (options.speId) {
    const developments = await prisma.development.findMany({
      where: { organizationId, speId: options.speId },
      select: { id: true },
    });
    developmentIds = developments.map((d) => d.id);
  } else if (options.developmentId) {
    developmentIds = [options.developmentId];
  }

  const contractScope = developmentIds ? { developmentId: { in: developmentIds } } : undefined;

  const [installments, payments, payables, receivablesAvulsos, openingBalance] = await Promise.all([
    prisma.installment.findMany({
      where: {
        status: { not: "CANCELLED" },
        dueDate: { gte: rangeStart, lte: rangeEnd },
        portfolio: { organizationId, contract: contractScope },
      },
      select: { dueDate: true, originalValue: true, correctedValue: true },
    }),
    prisma.installmentPayment.findMany({
      where: {
        paidAt: { gte: rangeStart, lte: rangeEnd },
        installment: { portfolio: { organizationId, contract: contractScope } },
      },
      select: { paidAt: true, amount: true },
    }),
    prisma.payable.findMany({
      where: {
        organizationId,
        status: { not: "CANCELLED" },
        dueDate: { gte: rangeStart, lte: rangeEnd },
      },
      select: {
        dueDate: true,
        amount: true,
        paidAt: true,
        paidAmount: true,
        status: true,
        developmentId: true,
        speId: true,
        allocations: { select: { developmentId: true, amount: true } },
      },
    }),
    prisma.receivable.findMany({
      where: {
        organizationId,
        status: { not: "CANCELLED" },
        dueDate: { gte: rangeStart, lte: rangeEnd },
      },
      select: {
        dueDate: true,
        amount: true,
        receivedAt: true,
        receivedAmount: true,
        status: true,
        developmentId: true,
        speId: true,
      },
    }),
    options.includeOpeningBalance === false
      ? Promise.resolve(0)
      : getOpeningBalanceTotal(organizationId, { speId: options.speId, developmentId: options.developmentId }),
  ]);

  function matchesScope(entry: { developmentId: string | null; speId: string | null }) {
    if (!developmentIds) return true;
    if (entry.developmentId) return developmentIds.includes(entry.developmentId);
    // lançamento sem empreendimento (nível organização/SPE): só entra no
    // recorte quando o filtro é por SPE e bate direto com o speId do
    // lançamento — nunca entra num filtro por empreendimento específico.
    return !!options.speId && entry.speId === options.speId;
  }

  const buckets = new Map<string, CashFlowBucket>();
  for (let cursor = new Date(rangeStart); cursor <= rangeEnd; cursor.setDate(cursor.getDate() + 1)) {
    const key = periodKey(cursor, granularity);
    if (!buckets.has(key)) {
      buckets.set(key, {
        period: key,
        receivablesForecast: 0,
        receivablesRealized: 0,
        payablesForecast: 0,
        payablesRealized: 0,
        netForecast: 0,
        netRealized: 0,
        variance: 0,
        cumulativeForecast: 0,
        cumulativeRealized: 0,
      });
    }
  }

  for (const installment of installments) {
    const bucket = buckets.get(periodKey(installment.dueDate, granularity));
    if (bucket) bucket.receivablesForecast += Number(installment.correctedValue ?? installment.originalValue);
  }
  for (const payment of payments) {
    const bucket = buckets.get(periodKey(payment.paidAt, granularity));
    if (bucket) bucket.receivablesRealized += Number(payment.amount);
  }
  for (const receivable of receivablesAvulsos) {
    if (!matchesScope(receivable)) continue;
    const forecastBucket = buckets.get(periodKey(receivable.dueDate, granularity));
    if (forecastBucket) forecastBucket.receivablesForecast += Number(receivable.amount);

    if (receivable.receivedAt && receivable.receivedAmount) {
      const realizedBucket = buckets.get(periodKey(receivable.receivedAt, granularity));
      if (realizedBucket) realizedBucket.receivablesRealized += Number(receivable.receivedAmount);
    }
  }
  for (const payable of payables) {
    const destinations = resolvePayableDestinations(payable);
    const relevant = developmentIds
      ? destinations.filter((d) => matchesScope({ developmentId: d.developmentId, speId: payable.speId }))
      : destinations;
    if (relevant.length === 0) continue;
    const allocatedAmount = relevant.reduce((acc, d) => acc + d.amount, 0);

    const forecastBucket = buckets.get(periodKey(payable.dueDate, granularity));
    if (forecastBucket) forecastBucket.payablesForecast += allocatedAmount;

    if (payable.paidAt && payable.paidAmount) {
      const realizedBucket = buckets.get(periodKey(payable.paidAt, granularity));
      if (realizedBucket) realizedBucket.payablesRealized += allocatedAmount;
    }
  }

  const result = [...buckets.values()];
  let cumulativeForecast = openingBalance;
  let cumulativeRealized = openingBalance;
  for (const bucket of result) {
    bucket.netForecast = round2(bucket.receivablesForecast - bucket.payablesForecast);
    bucket.netRealized = round2(bucket.receivablesRealized - bucket.payablesRealized);
    bucket.variance = round2(bucket.netRealized - bucket.netForecast);
    bucket.receivablesForecast = round2(bucket.receivablesForecast);
    bucket.receivablesRealized = round2(bucket.receivablesRealized);
    bucket.payablesForecast = round2(bucket.payablesForecast);
    bucket.payablesRealized = round2(bucket.payablesRealized);

    cumulativeForecast = round2(cumulativeForecast + bucket.netForecast);
    cumulativeRealized = round2(cumulativeRealized + bucket.netRealized);
    bucket.cumulativeForecast = cumulativeForecast;
    bucket.cumulativeRealized = cumulativeRealized;
  }
  return result;
}
