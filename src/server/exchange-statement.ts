import "server-only";

import { prisma } from "@/lib/prisma";
import { developmentOwnedScope, canAccessDevelopment } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";

export type ExchangeStatementEvent = {
  kind: "REPASSE" | "RETENTION_RELEASE" | "PERIOD_CLOSED";
  date: Date;
  label: string;
  amount: number;
  statusLabel: string;
};

/**
 * Extrato do permutante (docs/ESPEC_PERMUTANTES.md, Etapa 5) — resumo +
 * linha do tempo cronológica dos repasses, liberações de retenção e (na
 * financeira) fechamentos de período. Mesma filosofia do extrato do
 * investidor (Aportes, Etapa 6): junta o que os motores das etapas 3-4 já
 * produzem, sem cálculo novo.
 */
export async function getExchangeStatement(context: AccessContext, exchangeContractId: string) {
  const contract = await prisma.exchangeContract.findFirst({
    where: { id: exchangeContractId, ...developmentOwnedScope(context) },
    include: {
      permutante: true,
      development: true,
      units: true,
      financialTerms: true,
    },
  });
  if (!contract || !canAccessDevelopment(context, contract.developmentId)) {
    throw new Error("Contrato de permuta não encontrado.");
  }

  const [repasses, retentionReleases, periods] = await Promise.all([
    prisma.exchangeRepasse.findMany({
      where: { exchangeContractId },
      include: { payable: true },
      orderBy: { referenceDate: "asc" },
    }),
    prisma.exchangeRetentionRelease.findMany({
      where: { exchangeContractId },
      orderBy: { releaseDate: "asc" },
    }),
    prisma.exchangeApurationPeriod.findMany({
      where: { exchangeContractId },
      orderBy: { periodStart: "asc" },
    }),
  ]);

  const totalGrossBase = repasses.reduce((sum, r) => sum + Number(r.grossBase), 0);
  const totalAdministrationFee = repasses.reduce((sum, r) => sum + Number(r.administrationFeeAmount), 0);
  const totalExternalCommission = repasses.reduce((sum, r) => sum + Number(r.externalCommissionAmount), 0);
  const totalInternalCommission = repasses.reduce((sum, r) => sum + Number(r.internalCommissionAmount), 0);
  const totalRepassed = repasses.filter((r) => r.payableId).reduce((sum, r) => sum + Number(r.share), 0);
  const totalRetentionReleased = retentionReleases.reduce((sum, r) => sum + Number(r.amount), 0);

  const directRetained = repasses
    .filter((r) => !r.apurationPeriodId)
    .reduce((sum, r) => {
      const details = r.details as { retainedAmount?: number };
      return sum + (details.retainedAmount ?? 0);
    }, 0);
  const periodRetained = periods
    .filter((p) => p.status === "CLOSED")
    .reduce((sum, p) => sum + Number(p.retainedAmount ?? 0), 0);
  const totalRetained = directRetained + periodRetained;
  const retentionBalance = Math.round((totalRetained - totalRetentionReleased) * 100) / 100;

  const events: ExchangeStatementEvent[] = [
    ...repasses.map((r) => ({
      kind: "REPASSE" as const,
      date: r.referenceDate,
      label: contract.type === "FINANCIAL" ? "Evento de apuração" : "Repasse (pagamento de parcela)",
      amount: Number(r.share),
      statusLabel: r.payableId ? "Repassado" : "Acumulado no período",
    })),
    ...periods
      .filter((p) => p.status === "CLOSED")
      .map((p) => ({
        kind: "PERIOD_CLOSED" as const,
        date: p.closedAt ?? p.periodEnd,
        label: `Fechamento de período (${p.periodStart.toISOString().slice(0, 10)} a ${p.periodEnd.toISOString().slice(0, 10)})`,
        amount: Number(p.netAmount ?? 0),
        statusLabel: "Repassado",
      })),
    ...retentionReleases.map((r) => ({
      kind: "RETENTION_RELEASE" as const,
      date: r.releaseDate,
      label: "Liberação de retenção",
      amount: Number(r.amount),
      statusLabel: "Repassado",
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    contract: {
      id: contract.id,
      type: contract.type,
      status: contract.status,
      permutanteName: contract.permutante.name,
      permutanteDocument: contract.permutante.document,
      developmentName: contract.development.name,
      unitCount: contract.units.length,
      unitNumbers: contract.units.map((u) => u.number),
    },
    summary: {
      totalGrossBase: Math.round(totalGrossBase * 100) / 100,
      totalAdministrationFee: Math.round(totalAdministrationFee * 100) / 100,
      totalExternalCommission: Math.round(totalExternalCommission * 100) / 100,
      totalInternalCommission: Math.round(totalInternalCommission * 100) / 100,
      totalRepassed: Math.round(totalRepassed * 100) / 100,
      retentionBalance,
    },
    events,
  };
}
