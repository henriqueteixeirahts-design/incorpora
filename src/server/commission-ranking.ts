import "server-only";

import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";

export type CommissionRankingRow = {
  key: string; // brokerId ou agencyId, prefixado ("broker:"/"agency:") pra não colidir
  name: string;
  kind: "BROKER" | "AGENCY";
  totalEarned: number; // soma de value (comissão total resolvida — o "bolo")
  totalPaid: number; // soma de paidAmount (o que já foi efetivamente pago, regime caixa)
  saleCount: number;
};

/**
 * Ranking de corretores/imobiliárias (docs/ESPEC_CORRETOR_COMISSIONAMENTO.md,
 * Parte 4, Natureza 1 — "o sistema... RANQUEIA") — leitura pura sobre
 * ExternalCommissionSplit, sem tabela nova. Filtrado por `developmentAccess`.
 */
export async function getCommissionRanking(
  context: AccessContext,
  filters: { dateFrom?: Date; dateTo?: Date } = {},
): Promise<CommissionRankingRow[]> {
  const splits = await prisma.externalCommissionSplit.findMany({
    where: {
      sale: {
        organizationId: context.organizationId,
        ...(context.developmentAccess === "ALL" ? {} : { developmentId: { in: [...context.developmentAccess] } }),
      },
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
              ...(filters.dateTo ? { lte: filters.dateTo } : {}),
            },
          }
        : {}),
    },
  });

  const byKey = new Map<string, CommissionRankingRow>();
  for (const split of splits) {
    const key = split.brokerId ? `broker:${split.brokerId}` : split.agencyId ? `agency:${split.agencyId}` : null;
    if (!key) continue; // fatias de rótulo livre (coordenador/campanha) não entram no ranking

    const entry = byKey.get(key) ?? {
      key,
      name: "?",
      kind: split.brokerId ? "BROKER" : "AGENCY",
      totalEarned: 0,
      totalPaid: 0,
      saleCount: 0,
    };
    entry.totalEarned = Math.round((entry.totalEarned + Number(split.value)) * 100) / 100;
    entry.totalPaid = Math.round((entry.totalPaid + Number(split.paidAmount)) * 100) / 100;
    entry.saleCount += 1;
    byKey.set(key, entry);
  }

  const brokerIds = [...byKey.values()].filter((r) => r.kind === "BROKER").map((r) => r.key.replace("broker:", ""));
  const agencyIds = [...byKey.values()].filter((r) => r.kind === "AGENCY").map((r) => r.key.replace("agency:", ""));

  const [brokers, agencies] = await Promise.all([
    brokerIds.length ? prisma.broker.findMany({ where: { id: { in: brokerIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    agencyIds.length
      ? prisma.realEstateAgency.findMany({ where: { id: { in: agencyIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const brokerNameById = new Map(brokers.map((b) => [b.id, b.name]));
  const agencyNameById = new Map(agencies.map((a) => [a.id, a.name]));

  return [...byKey.values()]
    .map((row) => ({
      ...row,
      name:
        row.kind === "BROKER"
          ? (brokerNameById.get(row.key.replace("broker:", "")) ?? "?")
          : (agencyNameById.get(row.key.replace("agency:", "")) ?? "?"),
    }))
    .sort((a, b) => b.totalPaid - a.totalPaid);
}
