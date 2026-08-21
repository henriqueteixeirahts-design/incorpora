import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import type { AccessContext } from "@/server/auth-context";
import type { SplitTierKind } from "@/generated/prisma/client";

/**
 * Motor de split fixo/global da imobiliária
 * (docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 3.2/3.3). A regra é a
 * fonte de verdade da resolução — não lê
 * RealEstateAgency.regionalManagerBrokerId/productManagerBrokerId (esses só
 * existem pra pré-preencher a UI ao configurar a regra pela primeira vez).
 */
export type SplitTierInput = {
  label: string;
  percent: number;
  kind: SplitTierKind;
  fixedBrokerId?: string | null;
};

export function listSplitTiers(agencyId: string) {
  return prisma.agencySplitTier.findMany({ where: { agencyId }, orderBy: { sequence: "asc" } });
}

function assertTiersValid(tiers: SplitTierInput[]) {
  if (tiers.length === 0) throw new Error("Configure ao menos uma fatia de split.");

  const sum = tiers.reduce((acc, t) => acc + t.percent, 0);
  // Soma em centavos pra evitar erro de ponto flutuante (ex.: 33.33*3 = 99.99000000000001).
  if (Math.round(sum * 100) !== 10000) {
    throw new Error(`A soma das fatias precisa ser exatamente 100% (está em ${sum.toFixed(2)}%).`);
  }

  for (const tier of tiers) {
    if (tier.percent < 0 || tier.percent > 100) throw new Error(`Percentual inválido na fatia "${tier.label}".`);
    if (tier.kind === "FIXED_BROKER" && !tier.fixedBrokerId) {
      throw new Error(`Fatia "${tier.label}" é fixa mas não tem um corretor/gerente selecionado.`);
    }
  }
}

/** Substitui o conjunto inteiro de fatias da imobiliária (mesmo padrão de replace-all já usado em updateUserAccess). */
export async function upsertSplitTiers(context: AccessContext, agencyId: string, tiers: SplitTierInput[]) {
  assertTiersValid(tiers);

  const agency = await prisma.realEstateAgency.findFirst({ where: { id: agencyId, organizationId: context.organizationId } });
  if (!agency) throw new Error("Imobiliária não encontrada.");

  if (tiers.some((t) => t.kind === "FIXED_BROKER" && t.fixedBrokerId)) {
    const brokerIds = tiers.filter((t) => t.kind === "FIXED_BROKER" && t.fixedBrokerId).map((t) => t.fixedBrokerId!);
    const count = await prisma.broker.count({ where: { id: { in: brokerIds }, organizationId: context.organizationId } });
    if (count !== new Set(brokerIds).size) throw new Error("Corretor/gerente inválido numa das fatias fixas.");
  }

  return prisma.$transaction(async (tx) => {
    const before = await tx.agencySplitTier.findMany({ where: { agencyId } });
    await tx.agencySplitTier.deleteMany({ where: { agencyId } });
    const created = await Promise.all(
      tiers.map((tier, index) =>
        tx.agencySplitTier.create({
          data: {
            agencyId,
            label: tier.label,
            percent: tier.percent,
            kind: tier.kind,
            fixedBrokerId: tier.kind === "FIXED_BROKER" ? tier.fixedBrokerId : null,
            sequence: index,
          },
        }),
      ),
    );

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "AgencySplitTier",
      entityId: agencyId,
      beforeData: before,
      afterData: created,
    });

    return created;
  });
}

export type ResolvedSplitBeneficiary = {
  label: string;
  percent: number;
  kind: SplitTierKind;
  brokerId: string | null;
  agencyId: string | null;
};

/**
 * Resolução em tempo de venda (Parte 3.3) — função pura, sem acesso a
 * banco, pra ser testável isoladamente. `saleBrokerId`/`saleBrokerManagerId`
 * vêm de fora (já resolvidos: quem vendeu e o managerId dele, se tiver).
 * Caso-limite: fatia DYNAMIC_MANAGER_OF_BROKER quando o corretor não tem
 * gerente soma na fatia DYNAMIC_BROKER_OF_SALE (nunca é descartada).
 */
export function resolveAgencySplit(
  tiers: { label: string; percent: number; kind: SplitTierKind; fixedBrokerId: string | null }[],
  agencyId: string,
  saleBrokerId: string,
  saleBrokerManagerId: string | null,
): ResolvedSplitBeneficiary[] {
  const resolved: ResolvedSplitBeneficiary[] = [];
  let brokerExtraPercent = 0;

  for (const tier of tiers) {
    switch (tier.kind) {
      case "FIXED_AGENCY":
        resolved.push({ label: tier.label, percent: tier.percent, kind: tier.kind, brokerId: null, agencyId });
        break;
      case "FIXED_BROKER":
        resolved.push({ label: tier.label, percent: tier.percent, kind: tier.kind, brokerId: tier.fixedBrokerId, agencyId: null });
        break;
      case "DYNAMIC_BROKER_OF_SALE":
        resolved.push({ label: tier.label, percent: tier.percent, kind: tier.kind, brokerId: saleBrokerId, agencyId: null });
        break;
      case "DYNAMIC_MANAGER_OF_BROKER":
        if (saleBrokerManagerId) {
          resolved.push({ label: tier.label, percent: tier.percent, kind: tier.kind, brokerId: saleBrokerManagerId, agencyId: null });
        } else {
          brokerExtraPercent += tier.percent;
        }
        break;
    }
  }

  if (brokerExtraPercent > 0) {
    const brokerRow = resolved.find((r) => r.kind === "DYNAMIC_BROKER_OF_SALE");
    if (brokerRow) {
      brokerRow.percent += brokerExtraPercent;
    } else {
      resolved.push({ label: "Corretor", percent: brokerExtraPercent, kind: "DYNAMIC_BROKER_OF_SALE", brokerId: saleBrokerId, agencyId: null });
    }
  }

  return resolved;
}
