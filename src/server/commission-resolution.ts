import "server-only";

import { prisma } from "@/lib/prisma";
import { getEffectiveCommissionRule } from "@/server/commission-rules";
import { resolveAgencySplit } from "@/server/agency-split-tiers";
import { computeAllocationAmountsFromPercent } from "@/lib/payable-allocation";
import type { CommissionBeneficiaryType } from "@/generated/prisma/client";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type ExternalSplitToCreate = {
  beneficiaryType: CommissionBeneficiaryType;
  brokerId: string | null;
  agencyId: string | null;
  label: string | null;
  percent: number;
  value: number;
};

/**
 * Resolve os splits de comissão EXTERNA (Natureza 1 —
 * docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 3/4) no fechamento da
 * venda. `null` = sem `CommissionRule.externalCommissionPercent`
 * configurado pro empreendimento — o caller deve cair no fluxo legado da
 * Fase A (100% direto pro corretor/imobiliária via `CommissionSplit`).
 * `[]` = configurado, mas a venda não tem corretor/imobiliária nenhum.
 */
export async function resolveExternalSplitsForSale(params: {
  organizationId: string;
  developmentId: string;
  salePrice: number;
  brokerId: string | null;
  agencyId: string | null;
}): Promise<ExternalSplitToCreate[] | null> {
  const rule = await getEffectiveCommissionRule(params.organizationId, params.developmentId);
  if (rule.externalCommissionPercent === null) return null;
  if (!params.brokerId && !params.agencyId) return [];

  const totalCommission = round2((params.salePrice * rule.externalCommissionPercent) / 100);
  if (totalCommission <= 0) return [];

  // Autônomo (sem imobiliária): fatia única de 100% pro corretor (spec 3.3, item 5).
  if (!params.agencyId) {
    return [{ beneficiaryType: "BROKER", brokerId: params.brokerId, agencyId: null, label: null, percent: 100, value: totalCommission }];
  }

  const tiers = await prisma.agencySplitTier.findMany({ where: { agencyId: params.agencyId } });

  // Imobiliária vinculada mas sem split configurado ainda: não trava o
  // fechamento da venda por um cadastro incompleto em outra tela — tudo vai
  // pro corretor da venda (ou pra própria imobiliária, se não houver
  // corretor específico), preservando o valor total da comissão.
  if (tiers.length === 0) {
    const beneficiaryType: CommissionBeneficiaryType = params.brokerId ? "BROKER" : "AGENCY";
    return [
      {
        beneficiaryType,
        brokerId: params.brokerId ? params.brokerId : null,
        agencyId: params.brokerId ? null : params.agencyId,
        label: null,
        percent: 100,
        value: totalCommission,
      },
    ];
  }

  const manager = params.brokerId ? await prisma.broker.findUnique({ where: { id: params.brokerId } }) : null;

  const resolvedTiers = resolveAgencySplit(
    tiers.map((t) => ({ label: t.label, percent: Number(t.percent), kind: t.kind, fixedBrokerId: t.fixedBrokerId })),
    params.agencyId,
    params.brokerId ?? "",
    manager?.managerId ?? null,
  );

  // Reaproveita o helper de rateio N-way já usado pra Payable (largest
  // remainder — última fatia absorve o resto do arredondamento, soma
  // sempre bate exata). `developmentId` do helper é descartado aqui, só o
  // `amount` calculado importa.
  const amounts = computeAllocationAmountsFromPercent(
    totalCommission,
    resolvedTiers.map((t) => ({ developmentId: null, percent: t.percent })),
  );

  return resolvedTiers.map((tier, i) => ({
    beneficiaryType: tier.kind === "FIXED_AGENCY" ? "AGENCY" : "BROKER",
    brokerId: tier.brokerId,
    agencyId: tier.agencyId,
    label: tier.label,
    percent: tier.percent,
    value: amounts[i].amount,
  }));
}

export type InternalSplitToCreate = {
  brokerId: string;
  percent: number;
  value: number;
};

/**
 * Resolve o split de comissão INTERNA (Natureza 2) no fechamento da venda.
 * `null` = sem `CommissionRule.internalCommissionPercent` configurado, ou
 * sem gerente identificado — ALL_SALES sem
 * `CommissionRule.internalManagerBrokerId` configurado, ou
 * PARTICIPATED_ONLY sem `Sale.internalManagerBrokerId` setado nesta venda.
 */
export async function resolveInternalSplitForSale(params: {
  organizationId: string;
  developmentId: string;
  salePrice: number;
  saleInternalManagerBrokerId: string | null;
}): Promise<InternalSplitToCreate | null> {
  const rule = await getEffectiveCommissionRule(params.organizationId, params.developmentId);
  if (rule.internalCommissionPercent === null) return null;

  const managerId = params.saleInternalManagerBrokerId ?? (rule.internalCommissionAppliesTo === "ALL_SALES" ? rule.internalManagerBrokerId : null);
  if (!managerId) return null;

  const value = round2((params.salePrice * rule.internalCommissionPercent) / 100);
  if (value <= 0) return null;

  return { brokerId: managerId, percent: rule.internalCommissionPercent, value };
}
