import "server-only";

import { prisma } from "@/lib/prisma";
import { getSalesSummary, getReceivablesSummary } from "@/server/reports";
import { getPortfolioAging } from "@/server/aging";
import { getCommissionRanking } from "@/server/commission-ranking";
import { getCashFlow } from "@/server/cash-flow";
import { listPayablesForExport } from "@/server/payables";
import { getLatestConstructionMeasurement } from "@/server/construction";
import { listDevelopments } from "@/server/developments";
import type { AccessContext } from "@/server/auth-context";
import { developmentAccessScope, canAccessDevelopment } from "@/server/scope";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type DashboardPeriod = { dateFrom: Date; dateTo: Date };

/**
 * Dashboard executivo (docs/ESPEC_FASE_C_DASHBOARD_EMPREENDIMENTOS.md,
 * Etapa 3) — agrega dados já produzidos pelas Fases A/B/Permuta/Aportes,
 * sem cálculo financeiro novo (a única exceção é VSO de período e
 * exposição de caixa, ambos definidos com o usuário antes de codar).
 *
 * Simplificação registrada: VSO de período usa o total do estoque
 * (`unitsTotal`) como denominador de "unidades ofertadas" — o sistema não
 * rastreia hoje o momento em que uma unidade passou a estar "ofertada"
 * distinto da criação da unidade, então essa é a leitura mais fiel possível
 * sem inventar um conceito novo de "oferta".
 */
export async function getExecutiveDashboard(
  context: AccessContext,
  options: { developmentId?: string; period: DashboardPeriod },
) {
  const developmentId = options.developmentId;
  if (developmentId) {
    const development = await prisma.development.findFirst({
      where: { id: developmentId, organizationId: context.organizationId },
    });
    if (!development || !canAccessDevelopment(context, developmentId)) {
      throw new Error("Empreendimento inválido.");
    }
  }
  const { dateFrom, dateTo } = options.period;

  const [comercial, carteira, financeiro, obra] = await Promise.all([
    getComercialBlock(context, developmentId, dateFrom, dateTo),
    getCarteiraBlock(context, developmentId, dateFrom, dateTo),
    getFinanceiroBlock(context, developmentId, dateFrom, dateTo),
    getObraBlock(context, developmentId),
  ]);

  return { period: options.period, comercial, carteira, financeiro, obra };
}

async function getComercialBlock(context: AccessContext, developmentId: string | undefined, dateFrom: Date, dateTo: Date) {
  const organizationId = context.organizationId;
  const salesSummary = await getSalesSummary(organizationId, developmentId);

  const salesInPeriodCount = await prisma.sale.count({
    where: {
      organizationId,
      status: "ACTIVE",
      saleDate: { gte: dateFrom, lte: dateTo },
      ...(developmentId ? { developmentId } : developmentAccessScope(context)),
    },
  });
  const vso = salesSummary.unitsTotal > 0 ? round2((salesInPeriodCount / salesSummary.unitsTotal) * 100) : 0;

  // Curva de vendas — últimos 12 meses (contagem + VGV vendido por mês).
  const twelveMonthsAgo = new Date(dateTo.getFullYear(), dateTo.getMonth() - 11, 1);
  const salesLast12Months = await prisma.sale.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      saleDate: { gte: twelveMonthsAgo, lte: dateTo },
      ...(developmentId ? { developmentId } : developmentAccessScope(context)),
    },
    select: { saleDate: true, salePrice: true },
  });
  const curveByMonth = new Map<string, { unitsSold: number; vgvSold: number }>();
  for (let i = 0; i < 12; i++) {
    const month = new Date(twelveMonthsAgo.getFullYear(), twelveMonthsAgo.getMonth() + i, 1);
    curveByMonth.set(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`, { unitsSold: 0, vgvSold: 0 });
  }
  for (const sale of salesLast12Months) {
    const key = `${sale.saleDate.getFullYear()}-${String(sale.saleDate.getMonth() + 1).padStart(2, "0")}`;
    const bucket = curveByMonth.get(key);
    if (bucket) {
      bucket.unitsSold += 1;
      bucket.vgvSold += Number(sale.salePrice);
    }
  }
  const salesCurve = [...curveByMonth.entries()].map(([month, v]) => ({ month, ...v, vgvSold: round2(v.vgvSold) }));

  const reservationScope = developmentId ? { developmentId } : { development: developmentAccessScope(context) };
  const [reservasAtivas, propostasEmAnalise] = await Promise.all([
    prisma.reservation.count({ where: { organizationId, status: "ACTIVE", unit: reservationScope } }),
    prisma.proposal.count({
      where: {
        organizationId,
        status: "PENDING_APPROVAL",
        ...(developmentId ? { developmentId } : developmentAccessScope(context)),
      },
    }),
  ]);

  const rankingCanais = (await getCommissionRanking(context, { dateFrom, dateTo })).slice(0, 10);

  const distratos = await prisma.contractDistrato.findMany({
    where: {
      status: "SIGNED",
      signedAt: { gte: dateFrom, lte: dateTo },
      contract: {
        organizationId,
        ...(developmentId ? { developmentId } : developmentAccessScope(context)),
      },
    },
    select: { refundAmount: true },
  });
  const distratosCount = distratos.length;
  const distratosValue = round2(distratos.reduce((sum, d) => sum + Number(d.refundAmount), 0));
  const indiceDistratoVenda = salesInPeriodCount > 0 ? round2((distratosCount / salesInPeriodCount) * 100) : 0;

  return {
    vgvTotal: salesSummary.vgvTotal,
    vgvSold: salesSummary.vgvSold,
    vgvPermutante: salesSummary.vgvPermutante,
    vgvAvailable: salesSummary.vgvAvailable,
    percentSold: salesSummary.percentSold,
    ticketMedio: salesSummary.averageTicket,
    vso,
    salesInPeriodCount,
    salesCurve,
    funil: { reservasAtivas, propostasEmAnalise, vendasNoPeriodo: salesInPeriodCount },
    rankingCanais,
    distratos: { count: distratosCount, totalValue: distratosValue, indiceDistratoVenda },
  };
}

async function getCarteiraBlock(context: AccessContext, developmentId: string | undefined, dateFrom: Date, dateTo: Date) {
  const organizationId = context.organizationId;
  const receivablesSummary = await getReceivablesSummary(organizationId, developmentId);

  const contractScope = developmentId ? { developmentId } : developmentAccessScope(context);
  const paymentsInPeriod = await prisma.installmentPayment.findMany({
    where: {
      paidAt: { gte: dateFrom, lte: dateTo },
      installment: { portfolio: { organizationId, contract: contractScope } },
    },
    select: { amount: true },
  });
  const recebidoNoPeriodo = round2(paymentsInPeriod.reduce((sum, p) => sum + Number(p.amount), 0));

  const installmentsDueInPeriod = await prisma.installment.findMany({
    where: {
      status: { not: "CANCELLED" },
      dueDate: { gte: dateFrom, lte: dateTo },
      portfolio: { organizationId, contract: contractScope },
    },
    select: { originalValue: true, correctedValue: true },
  });
  const previstoNoPeriodo = round2(
    installmentsDueInPeriod.reduce((sum, i) => sum + Number(i.correctedValue ?? i.originalValue), 0),
  );

  const aging = await getPortfolioAging(context, developmentId ? { developmentId } : {});
  const overdueTotal = round2(aging.summaries.reduce((sum, b) => sum + b.totalValue, 0));
  const inadimplenciaPct =
    receivablesSummary.totalOutstanding > 0 ? round2((overdueTotal / receivablesSummary.totalOutstanding) * 100) : 0;

  const renegotiations = await prisma.renegotiationAgreement.findMany({
    where: {
      agreementDate: { gte: dateFrom, lte: dateTo },
      contract: { organizationId, ...contractScope },
    },
    select: { status: true },
  });
  const renegotiationsSigned = renegotiations.filter((r) => r.status === "SIGNED" || r.status === "BROKEN").length;
  const renegotiationsBroken = renegotiations.filter((r) => r.status === "BROKEN").length;
  const taxaCumprimento =
    renegotiationsSigned > 0 ? round2(((renegotiationsSigned - renegotiationsBroken) / renegotiationsSigned) * 100) : 0;

  return {
    totalOutstanding: receivablesSummary.totalOutstanding,
    recebidoNoPeriodo,
    previstoNoPeriodo,
    overdueTotal,
    inadimplenciaPct,
    agingResumo: aging.summaries,
    renegociacoes: { volume: renegotiations.length, taxaCumprimento },
  };
}

async function getFinanceiroBlock(context: AccessContext, developmentId: string | undefined, dateFrom: Date, dateTo: Date) {
  const cashFlowBuckets = await getCashFlow(context, { developmentId, granularity: "monthly", monthsBack: 0, monthsForward: 6 });

  const payables = await listPayablesForExport(context, {
    developmentId,
    dueDateFrom: new Date(),
    dueDateTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: undefined,
  });
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const activePayables = payables.filter((p) => p.status !== "CANCELLED" && p.status !== "PAID" && p.status !== "RECONCILED");
  const contasAPagarSemana = round2(activePayables.filter((p) => p.dueDate <= weekEnd).reduce((sum, p) => sum + Number(p.amount), 0));
  const contasAPagarMes = round2(activePayables.reduce((sum, p) => sum + Number(p.amount), 0));

  // Resultado por empreendimento (regime caixa, no período) + exposição de
  // caixa (ponto mais negativo do saldo acumulado projetado) — reaproveita
  // getCashFlow por empreendimento, sem calcular apuração/rateio de novo.
  const developments = developmentId
    ? [await prisma.development.findUniqueOrThrow({ where: { id: developmentId } })]
    : await listDevelopments(context);

  const resultadoPorEmpreendimento = await Promise.all(
    developments.map(async (dev) => {
      const buckets = await getCashFlow(context, {
        developmentId: dev.id,
        granularity: "monthly",
        monthsBack: 0,
        monthsForward: 6,
        includeOpeningBalance: false,
      });
      const periodBuckets = buckets.filter((b) => isBucketInPeriod(b.period, dateFrom, dateTo));
      const receita = round2(periodBuckets.reduce((sum, b) => sum + b.receivablesRealized, 0));
      const despesa = round2(periodBuckets.reduce((sum, b) => sum + b.payablesRealized, 0));
      const exposicao = round2(Math.min(0, ...buckets.map((b) => b.cumulativeForecast)));
      return { developmentId: dev.id, name: dev.name, receita, despesa, resultado: round2(receita - despesa), exposicao };
    }),
  );

  return {
    cashFlowBuckets,
    contasAPagarSemana,
    contasAPagarMes,
    resultadoPorEmpreendimento,
  };
}

function isBucketInPeriod(period: string, dateFrom: Date, dateTo: Date) {
  // period é "YYYY-MM" (granularidade mensal) — compara pelo mês.
  const [year, month] = period.split("-").map(Number);
  const bucketStart = new Date(year, month - 1, 1);
  const bucketEnd = new Date(year, month, 0, 23, 59, 59, 999);
  return bucketStart <= dateTo && bucketEnd >= dateFrom;
}

async function getObraBlock(context: AccessContext, developmentId: string | undefined) {
  const developments = developmentId
    ? [await prisma.development.findUniqueOrThrow({ where: { id: developmentId } })]
    : await listDevelopments(context);

  const rows = await Promise.all(
    developments.map(async (dev) => {
      const [measurement, salesSummary] = await Promise.all([
        getLatestConstructionMeasurement(context, dev.id),
        getSalesSummary(context.organizationId, dev.id),
      ]);
      return {
        developmentId: dev.id,
        name: dev.name,
        percentObra: measurement ? Number(measurement.overallPercentComplete) : null,
        measurementDate: measurement?.measurementDate ?? null,
        percentVendido: salesSummary.percentSold,
        habiteSeDate: dev.habiteSeDate,
        expectedDeliveryDate: dev.expectedDeliveryDate,
      };
    }),
  );

  return { developments: rows };
}
