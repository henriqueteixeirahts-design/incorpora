import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { DEFAULT_COLLECTION_STEPS, resolveCollectionStage, type CollectionStep } from "@/lib/collection-stage";
import type { AccessContext } from "@/server/auth-context";

export { DEFAULT_COLLECTION_STEPS, resolveCollectionStage, type CollectionStep };

/**
 * Régua de cobrança por empreendimento (Fase B, Parte 3.2). Mesmo padrão
 * 1:1-por-Development das outras regras parametrizáveis: default sugerido
 * sem linha salva, upsert idempotente quando configurada. Etapa assistida
 * — as etapas só descrevem prazo × ação sugerida; "em qual etapa o cliente
 * está" é calculado na hora contra os dias em atraso, nunca persistido.
 */
export async function getEffectiveCollectionSteps(developmentId: string): Promise<CollectionStep[]> {
  const rule = await prisma.collectionRule.findUnique({
    where: { developmentId },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });
  if (!rule || rule.steps.length === 0) return DEFAULT_COLLECTION_STEPS;
  return rule.steps.map((s) => ({ sequence: s.sequence, offsetDays: s.offsetDays, actionLabel: s.actionLabel }));
}

/** Regra bruta (ou null se ainda não configurada) — pra distinguir "usando os defaults" de "customizada" na tela. */
export function getCollectionRule(context: AccessContext, developmentId: string) {
  return prisma.collectionRule.findFirst({
    where: { developmentId, development: { organizationId: context.organizationId } },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });
}

export async function upsertCollectionRule(context: AccessContext, developmentId: string, steps: CollectionStep[]) {
  if (steps.length === 0) throw new Error("A régua precisa ter ao menos uma etapa.");

  return prisma.$transaction(async (tx) => {
    const development = await tx.development.findFirst({
      where: { id: developmentId, organizationId: context.organizationId },
    });
    if (!development) throw new Error("Empreendimento inválido.");

    const before = await tx.collectionRule.findUnique({ where: { developmentId }, include: { steps: true } });

    const rule = await tx.collectionRule.upsert({
      where: { developmentId },
      create: { developmentId },
      update: {},
    });

    await tx.collectionRuleStep.deleteMany({ where: { collectionRuleId: rule.id } });
    await tx.collectionRuleStep.createMany({
      data: steps.map((s) => ({ collectionRuleId: rule.id, sequence: s.sequence, offsetDays: s.offsetDays, actionLabel: s.actionLabel })),
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: before ? "update" : "create",
      entityType: "CollectionRule",
      entityId: rule.id,
      beforeData: before,
      afterData: { steps },
    });

    return rule;
  });
}
