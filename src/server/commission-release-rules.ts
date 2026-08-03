import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import type { AccessContext } from "@/server/auth-context";
import type { CommissionReleaseTrigger } from "@/generated/prisma/client";

/**
 * Regra de liberação de comissão por empreendimento (Fase A, Parte 4.1).
 * Mesmo padrão 1:1-por-Development das outras regras parametrizáveis
 * (ReservationRule, ProposalEvaluationRule): default sugerido sem linha
 * salva, upsert idempotente quando configurada.
 */
export type CommissionReleaseRuleValues = {
  trigger: CommissionReleaseTrigger;
  installmentsPaidPercent: number;
};

export const DEFAULT_COMMISSION_RELEASE_RULE: CommissionReleaseRuleValues = {
  trigger: "ON_CONTRACT_SIGNATURE",
  installmentsPaidPercent: 50,
};

export async function getEffectiveCommissionReleaseRule(developmentId: string): Promise<CommissionReleaseRuleValues> {
  const rule = await prisma.commissionReleaseRule.findUnique({ where: { developmentId } });
  if (!rule) return DEFAULT_COMMISSION_RELEASE_RULE;
  return { trigger: rule.trigger, installmentsPaidPercent: rule.installmentsPaidPercent };
}

/** Regra bruta (ou null se ainda não configurada) — pra distinguir "usando os defaults" de "customizada" na tela. */
export function getCommissionReleaseRule(context: AccessContext, developmentId: string) {
  return prisma.commissionReleaseRule.findFirst({
    where: { developmentId, development: { organizationId: context.organizationId } },
  });
}

export async function upsertCommissionReleaseRule(
  context: AccessContext,
  developmentId: string,
  input: CommissionReleaseRuleValues,
) {
  return prisma.$transaction(async (tx) => {
    const development = await tx.development.findFirst({
      where: { id: developmentId, organizationId: context.organizationId },
    });
    if (!development) throw new Error("Empreendimento inválido.");

    const before = await tx.commissionReleaseRule.findUnique({ where: { developmentId } });

    const rule = await tx.commissionReleaseRule.upsert({
      where: { developmentId },
      create: { developmentId, ...input },
      update: input,
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: before ? "update" : "create",
      entityType: "CommissionReleaseRule",
      entityId: rule.id,
      beforeData: before,
      afterData: rule,
    });

    return rule;
  });
}
