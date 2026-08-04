import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { maxRetentionPercent } from "@/lib/distrato-settlement";
import type { AccessContext } from "@/server/auth-context";

/**
 * Regra de distrato por empreendimento (Fase A, Parte 2.4). Mesmo padrão
 * 1:1-por-Development das outras regras parametrizáveis: default sugerido
 * sem linha salva, upsert idempotente quando configurada.
 */
export type DistratoRuleValues = {
  retentionPercent: number;
  reverseCommissionOnDistrato: boolean;
};

export const DEFAULT_DISTRATO_RULE: DistratoRuleValues = {
  retentionPercent: 25,
  reverseCommissionOnDistrato: true,
};

export async function getEffectiveDistratoRule(developmentId: string): Promise<DistratoRuleValues> {
  const rule = await prisma.distratoRule.findUnique({ where: { developmentId } });
  if (!rule) return DEFAULT_DISTRATO_RULE;
  return { retentionPercent: Number(rule.retentionPercent), reverseCommissionOnDistrato: rule.reverseCommissionOnDistrato };
}

/** Regra bruta (ou null se ainda não configurada) — pra distinguir "usando os defaults" de "customizada" na tela. */
export function getDistratoRule(context: AccessContext, developmentId: string) {
  return prisma.distratoRule.findFirst({
    where: { developmentId, development: { organizationId: context.organizationId } },
  });
}

export async function upsertDistratoRule(context: AccessContext, developmentId: string, input: DistratoRuleValues) {
  return prisma.$transaction(async (tx) => {
    const development = await tx.development.findFirst({
      where: { id: developmentId, organizationId: context.organizationId },
    });
    if (!development) throw new Error("Empreendimento inválido.");

    const cap = maxRetentionPercent(development.hasPropertyAffectation);
    if (input.retentionPercent < 0 || input.retentionPercent > cap) {
      throw new Error(
        `Retenção inválida — o teto legal (Lei 13.786/18) é ${cap}% ${development.hasPropertyAffectation ? "(com patrimônio de afetação)" : "(sem patrimônio de afetação instituído)"}.`,
      );
    }

    const before = await tx.distratoRule.findUnique({ where: { developmentId } });

    const rule = await tx.distratoRule.upsert({
      where: { developmentId },
      create: { developmentId, ...input },
      update: input,
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: before ? "update" : "create",
      entityType: "DistratoRule",
      entityId: rule.id,
      beforeData: before,
      afterData: rule,
    });

    return rule;
  });
}
