import "server-only";

import { prisma } from "@/lib/prisma";
import { resolvePayableDestinations } from "@/server/payable-allocations";

export type CashFlowMonth = {
  month: string; // "YYYY-MM"
  receivablesForecast: number; // parcelas com vencimento no mês (carteira)
  receivablesRealized: number; // recebimentos efetivos lançados no mês
  payablesForecast: number; // contas a pagar com vencimento no mês
  payablesRealized: number; // pagamentos efetivos lançados no mês
  netForecast: number;
  netRealized: number;
};

/**
 * Fluxo de caixa consolidado: soma a carteira a receber (Installment) já
 * existente desde a Sprint 6-7 com as contas a pagar desta sprint, sem
 * duplicar dados — cada fonte é somada por mês de vencimento (previsto) e
 * por mês do lançamento efetivo (realizado).
 */
export async function getCashFlow(
  organizationId: string,
  options: { developmentId?: string; monthsBack?: number; monthsForward?: number } = {},
): Promise<CashFlowMonth[]> {
  const monthsBack = options.monthsBack ?? 2;
  const monthsForward = options.monthsForward ?? 6;

  const today = new Date();
  const rangeStart = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
  const rangeEnd = new Date(today.getFullYear(), today.getMonth() + monthsForward + 1, 0);

  const [installments, payments, payables] = await Promise.all([
    prisma.installment.findMany({
      where: {
        status: { not: "CANCELLED" },
        dueDate: { gte: rangeStart, lte: rangeEnd },
        portfolio: {
          organizationId,
          contract: options.developmentId ? { developmentId: options.developmentId } : undefined,
        },
      },
      select: { dueDate: true, originalValue: true, correctedValue: true },
    }),
    prisma.installmentPayment.findMany({
      where: {
        paidAt: { gte: rangeStart, lte: rangeEnd },
        installment: {
          portfolio: {
            organizationId,
            contract: options.developmentId ? { developmentId: options.developmentId } : undefined,
          },
        },
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
        allocations: { select: { developmentId: true, amount: true } },
      },
    }),
  ]);

  const buckets = new Map<string, CashFlowMonth>();
  for (let i = -monthsBack; i <= monthsForward; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const key = monthKey(date);
    buckets.set(key, {
      month: key,
      receivablesForecast: 0,
      receivablesRealized: 0,
      payablesForecast: 0,
      payablesRealized: 0,
      netForecast: 0,
      netRealized: 0,
    });
  }

  for (const installment of installments) {
    const bucket = buckets.get(monthKey(installment.dueDate));
    if (bucket) bucket.receivablesForecast += Number(installment.correctedValue ?? installment.originalValue);
  }
  for (const payment of payments) {
    const bucket = buckets.get(monthKey(payment.paidAt));
    if (bucket) bucket.receivablesRealized += Number(payment.amount);
  }
  for (const payable of payables) {
    const destinations = resolvePayableDestinations(payable);
    const relevant = options.developmentId
      ? destinations.filter((d) => d.developmentId === options.developmentId)
      : destinations;
    if (relevant.length === 0) continue;
    const allocatedAmount = relevant.reduce((acc, d) => acc + d.amount, 0);

    const forecastBucket = buckets.get(monthKey(payable.dueDate));
    if (forecastBucket) forecastBucket.payablesForecast += allocatedAmount;

    if (payable.paidAt && payable.paidAmount) {
      const realizedBucket = buckets.get(monthKey(payable.paidAt));
      if (realizedBucket) realizedBucket.payablesRealized += allocatedAmount;
    }
  }

  const result = [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const bucket of result) {
    bucket.netForecast = round2(bucket.receivablesForecast - bucket.payablesForecast);
    bucket.netRealized = round2(bucket.receivablesRealized - bucket.payablesRealized);
    bucket.receivablesForecast = round2(bucket.receivablesForecast);
    bucket.receivablesRealized = round2(bucket.receivablesRealized);
    bucket.payablesForecast = round2(bucket.payablesForecast);
    bucket.payablesRealized = round2(bucket.payablesRealized);
  }
  return result;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
