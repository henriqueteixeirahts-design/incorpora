import "server-only";

import { prisma } from "@/lib/prisma";
import { getInstallmentLivePosition } from "@/server/receivables";
import { canAccessDevelopment, developmentAccessScope, speOwnedScope } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type ConsolidatedReceivableOrigin = "SALES" | "AVULSO" | "INVESTOR_CONTRIBUTION";
export type ConsolidatedReceivableStatus = "FORECAST" | "OVERDUE" | "REALIZED";

export const CONSOLIDATED_ORIGIN_LABELS: Record<ConsolidatedReceivableOrigin, string> = {
  SALES: "Carteira de vendas",
  AVULSO: "Recebível avulso",
  INVESTOR_CONTRIBUTION: "Aporte de investidor",
};

export const CONSOLIDATED_STATUS_LABELS: Record<ConsolidatedReceivableStatus, string> = {
  FORECAST: "Previsto",
  OVERDUE: "Vencido",
  REALIZED: "Realizado",
};

export type ConsolidatedReceivableRow = {
  origin: ConsolidatedReceivableOrigin;
  id: string;
  description: string;
  developmentId: string | null;
  developmentName: string | null;
  speId: string | null;
  speName: string | null;
  dueDate: Date;
  amount: number;
  status: ConsolidatedReceivableStatus;
};

export type ConsolidatedReceivablesFilters = {
  origin?: ConsolidatedReceivableOrigin;
  developmentId?: string;
  speId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: ConsolidatedReceivableStatus;
};

/**
 * Contas a Receber Consolidado (docs/ESPEC_APORTES_INVESTIDORES.md, Parte 5)
 * — todas as entradas previstas e realizadas da SPE/organização num só
 * lugar, com origem identificada: carteira de vendas, recebíveis avulsos e
 * aportes de investidores. Contraparte do Contas a Pagar.
 *
 * Regra de ouro: esta função é só pra exibição/fluxo de caixa — NUNCA usar o
 * resultado dela pra alimentar um relatório de resultado (receita − despesa).
 * Aporte é funding, não receita (ver src/server/reports.ts, que não toca
 * nenhuma das 3 fontes de aporte).
 */
export async function listConsolidatedReceivables(
  context: AccessContext,
  filters: ConsolidatedReceivablesFilters = {},
): Promise<ConsolidatedReceivableRow[]> {
  if (filters.developmentId && !canAccessDevelopment(context, filters.developmentId)) return [];

  const now = new Date();
  const rows: ConsolidatedReceivableRow[] = [];

  if (!filters.origin || filters.origin === "SALES") {
    const installments = await prisma.installment.findMany({
      where: {
        status: { not: "CANCELLED" },
        portfolio: {
          organizationId: context.organizationId,
          contract: filters.developmentId ? { developmentId: filters.developmentId } : developmentAccessScope(context),
        },
        ...(filters.dateFrom || filters.dateTo
          ? { dueDate: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
          : {}),
      },
      include: {
        portfolio: {
          include: {
            contract: {
              include: {
                unit: true,
                development: { include: { spe: true, postHabiteSeIndexRule: { include: { values: true } } } },
                indexRule: { include: { values: true } },
              },
            },
          },
        },
      },
    });

    for (const installment of installments) {
      const contract = installment.portfolio.contract;
      if (filters.speId && contract.development.spe.id !== filters.speId) continue;

      const status: ConsolidatedReceivableStatus =
        installment.status === "PAID" ? "REALIZED" : installment.dueDate < now ? "OVERDUE" : "FORECAST";
      if (filters.status && filters.status !== status) continue;

      const amount =
        status === "REALIZED"
          ? Number(installment.paidAmount)
          : getInstallmentLivePosition(
              {
                status: installment.status,
                originalValue: Number(installment.originalValue),
                correctedValue: installment.correctedValue ? Number(installment.correctedValue) : null,
                lastCalculatedAt: installment.lastCalculatedAt,
                dueDate: installment.dueDate,
                correctionExempt: installment.correctionExempt,
              },
              contract,
              contract.development,
              now,
            ).resultValue;

      rows.push({
        origin: "SALES",
        id: installment.id,
        description: `${contract.contractNumber} — ${installment.label}`,
        developmentId: contract.developmentId,
        developmentName: contract.development.name,
        speId: contract.development.spe.id,
        speName: contract.development.spe.name,
        dueDate: installment.dueDate,
        amount: round2(amount),
        status,
      });
    }
  }

  if (!filters.origin || filters.origin === "AVULSO") {
    const developmentAccessWhere =
      context.developmentAccess === "ALL"
        ? {}
        : { OR: [{ developmentId: null }, { developmentId: { in: [...context.developmentAccess] } }] };

    const receivables = await prisma.receivable.findMany({
      where: {
        organizationId: context.organizationId,
        status: { not: "CANCELLED" },
        ...developmentAccessWhere,
        ...(filters.developmentId ? { developmentId: filters.developmentId } : {}),
        ...(filters.speId ? { speId: filters.speId } : {}),
        ...(filters.dateFrom || filters.dateTo
          ? { dueDate: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
          : {}),
      },
      include: { development: true, spe: true },
    });

    for (const receivable of receivables) {
      const status: ConsolidatedReceivableStatus =
        receivable.status === "RECEIVED" ? "REALIZED" : receivable.dueDate < now ? "OVERDUE" : "FORECAST";
      if (filters.status && filters.status !== status) continue;

      rows.push({
        origin: "AVULSO",
        id: receivable.id,
        description: receivable.origin,
        developmentId: receivable.developmentId,
        developmentName: receivable.development?.name ?? null,
        speId: receivable.speId,
        speName: receivable.spe?.name ?? null,
        dueDate: receivable.dueDate,
        amount: status === "REALIZED" ? Number(receivable.receivedAmount ?? receivable.amount) : Number(receivable.amount),
        status,
      });
    }
  }

  if (!filters.origin || filters.origin === "INVESTOR_CONTRIBUTION") {
    // Aportes são escopados por SPE, não por empreendimento — um filtro por
    // empreendimento específico não consegue atribuir capital de SPE a um
    // empreendimento só, então fica fora desse recorte (mesma decisão já
    // tomada em getCashFlow).
    if (!filters.developmentId) {
      const investorFilter = { ...speOwnedScope(context), ...(filters.speId ? { speId: filters.speId } : {}) };

      const [forecasts, contributions] = await Promise.all([
        prisma.speInvestorContributionForecast.findMany({
          where: {
            investor: investorFilter,
            status: { in: ["PLANNED", "PARTIALLY_FULFILLED"] },
            ...(filters.dateFrom || filters.dateTo
              ? { expectedDate: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
              : {}),
          },
          include: { investor: { include: { spe: true } } },
        }),
        prisma.speInvestorContribution.findMany({
          where: {
            investor: investorFilter,
            ...(filters.dateFrom || filters.dateTo
              ? { creditDate: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
              : {}),
          },
          include: { investor: { include: { spe: true } } },
        }),
      ]);

      if (!filters.status || filters.status === "FORECAST" || filters.status === "OVERDUE") {
        for (const forecast of forecasts) {
          const status: ConsolidatedReceivableStatus = forecast.expectedDate < now ? "OVERDUE" : "FORECAST";
          if (filters.status && filters.status !== status) continue;
          rows.push({
            origin: "INVESTOR_CONTRIBUTION",
            id: forecast.id,
            description: `Previsão de aporte — ${forecast.investor.name}`,
            developmentId: null,
            developmentName: null,
            speId: forecast.investor.speId,
            speName: forecast.investor.spe.name,
            dueDate: forecast.expectedDate,
            amount: Number(forecast.amount),
            status,
          });
        }
      }

      if (!filters.status || filters.status === "REALIZED") {
        for (const contribution of contributions) {
          rows.push({
            origin: "INVESTOR_CONTRIBUTION",
            id: contribution.id,
            description: `Aporte realizado — ${contribution.investor.name}`,
            developmentId: null,
            developmentName: null,
            speId: contribution.investor.speId,
            speName: contribution.investor.spe.name,
            dueDate: contribution.creditDate,
            amount: Number(contribution.amount),
            status: "REALIZED",
          });
        }
      }
    }
  }

  return rows.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export type ConsolidatedReceivablesTotals = {
  byOrigin: Record<ConsolidatedReceivableOrigin, number>;
  byStatus: Record<ConsolidatedReceivableStatus, number>;
  overall: number;
};

export function summarizeConsolidatedReceivables(rows: ConsolidatedReceivableRow[]): ConsolidatedReceivablesTotals {
  const byOrigin: Record<ConsolidatedReceivableOrigin, number> = { SALES: 0, AVULSO: 0, INVESTOR_CONTRIBUTION: 0 };
  const byStatus: Record<ConsolidatedReceivableStatus, number> = { FORECAST: 0, OVERDUE: 0, REALIZED: 0 };
  let overall = 0;

  for (const row of rows) {
    byOrigin[row.origin] += row.amount;
    byStatus[row.status] += row.amount;
    overall += row.amount;
  }

  return {
    byOrigin: { SALES: round2(byOrigin.SALES), AVULSO: round2(byOrigin.AVULSO), INVESTOR_CONTRIBUTION: round2(byOrigin.INVESTOR_CONTRIBUTION) },
    byStatus: { FORECAST: round2(byStatus.FORECAST), OVERDUE: round2(byStatus.OVERDUE), REALIZED: round2(byStatus.REALIZED) },
    overall: round2(overall),
  };
}
