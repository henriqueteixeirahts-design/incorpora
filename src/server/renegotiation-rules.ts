import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import type { AccessContext } from "@/server/auth-context";
import type { ApprovalLevel } from "@/generated/prisma/client";

/**
 * Regra de renegociação de parcelas por empreendimento (Fase B, Parte 2.2).
 * Mesmo padrão 1:1-por-Development das outras regras parametrizáveis:
 * default sugerido sem linha salva, upsert idempotente quando configurada.
 */
export type RenegotiationRuleValues = {
  maxDiscountOnChargesPercent: number;
  maxTermMonths: number;
  brokenDealGraceDays: number;
  reactivateOriginalOnBreak: boolean;
  approvalLevels: ApprovalLevel[];
};

export const DEFAULT_RENEGOTIATION_RULE: RenegotiationRuleValues = {
  maxDiscountOnChargesPercent: 20,
  maxTermMonths: 24,
  brokenDealGraceDays: 15,
  reactivateOriginalOnBreak: false,
  approvalLevels: ["SALES_MANAGER"],
};

export async function getEffectiveRenegotiationRule(developmentId: string): Promise<RenegotiationRuleValues> {
  const rule = await prisma.renegotiationRule.findUnique({ where: { developmentId } });
  if (!rule) return DEFAULT_RENEGOTIATION_RULE;
  return {
    maxDiscountOnChargesPercent: Number(rule.maxDiscountOnChargesPercent),
    maxTermMonths: rule.maxTermMonths,
    brokenDealGraceDays: rule.brokenDealGraceDays,
    reactivateOriginalOnBreak: rule.reactivateOriginalOnBreak,
    approvalLevels: rule.approvalLevels,
  };
}

/** Regra bruta (ou null se ainda não configurada) — pra distinguir "usando os defaults" de "customizada" na tela. */
export function getRenegotiationRule(context: AccessContext, developmentId: string) {
  return prisma.renegotiationRule.findFirst({
    where: { developmentId, development: { organizationId: context.organizationId } },
  });
}

export async function upsertRenegotiationRule(context: AccessContext, developmentId: string, input: RenegotiationRuleValues) {
  if (input.approvalLevels.length === 0) {
    throw new Error("Selecione ao menos um nível de aprovação pra descontos acima da tolerância.");
  }

  return prisma.$transaction(async (tx) => {
    const development = await tx.development.findFirst({
      where: { id: developmentId, organizationId: context.organizationId },
    });
    if (!development) throw new Error("Empreendimento inválido.");

    const before = await tx.renegotiationRule.findUnique({ where: { developmentId } });

    const rule = await tx.renegotiationRule.upsert({
      where: { developmentId },
      create: { developmentId, ...input },
      update: input,
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: before ? "update" : "create",
      entityType: "RenegotiationRule",
      entityId: rule.id,
      beforeData: before,
      afterData: rule,
    });

    return rule;
  });
}
