import "server-only";

import { prisma } from "@/lib/prisma";
import { speOwnedScope } from "@/server/scope";
import { getInvestorLoanPosition } from "@/server/spe-investor-loan";
import { computeCapitalCallDisplayStatus } from "@/server/spe-capital-calls";
import type { AccessContext } from "@/server/auth-context";
import type { CalculateInvestorLoanPositionResult } from "@/lib/loan-balance";

export type InvestorStatementEvent = {
  kind: "FORECAST" | "CAPITAL_CALL" | "CONTRIBUTION" | "RETURN";
  date: Date;
  label: string;
  amount: number;
  statusLabel: string;
};

export type InvestorStatement = {
  investor: {
    id: string;
    name: string;
    document: string;
    modality: string;
    committedCapital: number | null;
    resultParticipationPct: number | null;
  };
  summary: {
    committed: number | null;
    totalContributed: number;
    totalReturned: number;
    netPosition: number;
    loanPosition: CalculateInvestorLoanPositionResult | null;
  };
  events: InvestorStatementEvent[];
};

const FORECAST_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Previsto",
  PARTIALLY_FULFILLED: "Parcialmente baixado",
  FULFILLED: "Baixado",
  CANCELLED: "Cancelado",
};

const CAPITAL_CALL_STATUS_LABELS: Record<string, string> = {
  EMITTED: "Emitida",
  PARTIALLY_FULFILLED: "Atendida (parcial)",
  FULFILLED: "Atendida",
  CANCELLED: "Cancelada",
  OVERDUE: "Vencida",
};

const RETURN_TYPE_LABELS: Record<string, string> = {
  RESULT_DISTRIBUTION: "Distribuição de resultado",
  LOAN_AMORTIZATION: "Amortização de mútuo",
};

/**
 * Extrato consolidado do investidor (docs/ESPEC_APORTES_INVESTIDORES.md,
 * Parte 4) — resumo + linha do tempo cronológica de previsões, chamadas,
 * aportes e devoluções. Mesma tela que alimentará o painel do investidor no
 * portal (Fase 2) — construída uma vez, reaproveitada lá.
 */
export async function getInvestorStatement(context: AccessContext, investorId: string): Promise<InvestorStatement> {
  const investor = await prisma.speInvestor.findFirst({ where: { id: investorId, ...speOwnedScope(context) } });
  if (!investor) throw new Error("Investidor não encontrado.");

  const [forecasts, capitalCalls, contributions, returns] = await Promise.all([
    prisma.speInvestorContributionForecast.findMany({ where: { investorId }, orderBy: { expectedDate: "asc" } }),
    prisma.speCapitalCall.findMany({ where: { forecast: { investorId } }, include: { forecast: true }, orderBy: { deadlineDate: "asc" } }),
    prisma.speInvestorContribution.findMany({ where: { investorId }, orderBy: { creditDate: "asc" } }),
    prisma.speInvestorReturn.findMany({ where: { investorId }, orderBy: { referenceDate: "asc" } }),
  ]);

  const events: InvestorStatementEvent[] = [
    ...forecasts.map((f) => ({
      kind: "FORECAST" as const,
      date: f.expectedDate,
      label: "Previsão de aporte",
      amount: Number(f.amount),
      statusLabel: FORECAST_STATUS_LABELS[f.status] ?? f.status,
    })),
    ...capitalCalls.map((c) => ({
      kind: "CAPITAL_CALL" as const,
      date: c.deadlineDate,
      label: `Chamada de capital${c.purpose ? ` — ${c.purpose}` : ""}`,
      amount: Number(c.forecast.amount),
      statusLabel: CAPITAL_CALL_STATUS_LABELS[computeCapitalCallDisplayStatus(c.forecast.status, c.deadlineDate)],
    })),
    ...contributions.map((c) => ({
      kind: "CONTRIBUTION" as const,
      date: c.creditDate,
      label: "Aporte realizado",
      amount: Number(c.amount),
      statusLabel: "Realizado",
    })),
    ...returns.map((r) => ({
      kind: "RETURN" as const,
      date: r.referenceDate,
      label: RETURN_TYPE_LABELS[r.type] ?? r.type,
      amount: Number(r.amount),
      statusLabel: "Registrada",
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const totalContributed = contributions.reduce((sum, c) => sum + Number(c.amount), 0);
  const totalReturned = returns.reduce((sum, r) => sum + Number(r.amount), 0);

  const loanPosition =
    investor.modality === "LOAN" && investor.loanInterestRate && investor.loanInterestPeriod && investor.loanInterestType
      ? await getInvestorLoanPosition(context, investorId)
      : null;

  return {
    investor: {
      id: investor.id,
      name: investor.name,
      document: investor.document,
      modality: investor.modality,
      committedCapital: investor.committedCapital !== null ? Number(investor.committedCapital) : null,
      resultParticipationPct: investor.resultParticipationPct !== null ? Number(investor.resultParticipationPct) : null,
    },
    summary: {
      committed: investor.committedCapital !== null ? Number(investor.committedCapital) : null,
      totalContributed,
      totalReturned,
      netPosition: totalContributed - totalReturned,
      loanPosition,
    },
    events,
  };
}
