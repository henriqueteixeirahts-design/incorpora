import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { DEFAULT_COLLECTION_STEPS, resolveCollectionStage, type CollectionStep } from "@/lib/collection-stage";
import { canAccessDevelopment } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";

export { DEFAULT_COLLECTION_STEPS, resolveCollectionStage, type CollectionStep };

/**
 * Régua de cobrança — geral (organização) OU por empreendimento (Fase B,
 * Parte 3.2; docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 1.3). Resolução em
 * cascata: régua do empreendimento específico → régua geral da organização
 * → default do código. `developmentId: null` em `upsertCollectionRule`
 * grava/edita a linha geral. Etapa assistida — as etapas só descrevem prazo
 * × ação sugerida; "em qual etapa o cliente está" é calculado na hora
 * contra os dias em atraso, nunca persistido.
 */
export async function getEffectiveCollectionSteps(organizationId: string, developmentId: string): Promise<CollectionStep[]> {
  const rule = await prisma.collectionRule.findUnique({
    where: { developmentId },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });
  if (rule && rule.steps.length > 0) {
    return rule.steps.map((s) => ({ sequence: s.sequence, offsetDays: s.offsetDays, actionLabel: s.actionLabel }));
  }

  const general = await prisma.collectionRule.findFirst({
    where: { organizationId, developmentId: null },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });
  if (general && general.steps.length > 0) {
    return general.steps.map((s) => ({ sequence: s.sequence, offsetDays: s.offsetDays, actionLabel: s.actionLabel }));
  }

  return DEFAULT_COLLECTION_STEPS;
}

/** Régua geral da organização, bruta (ou null se ainda não configurada). */
export function getGeneralCollectionRule(context: AccessContext) {
  return prisma.collectionRule.findFirst({
    where: { organizationId: context.organizationId, developmentId: null },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });
}

/** Regra bruta de um empreendimento (ou null) — pra distinguir "usando a geral/default" de "customizada" na tela. */
export function getCollectionRule(context: AccessContext, developmentId: string) {
  if (!canAccessDevelopment(context, developmentId)) return Promise.resolve(null);
  return prisma.collectionRule.findFirst({
    where: { developmentId, development: { organizationId: context.organizationId } },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });
}

/**
 * Empreendimentos da organização que têm uma régua própria (sobrescrevem a
 * geral) — filtrado pelo `developmentAccess` do usuário, pra não vazar quais
 * empreendimentos fora do escopo dele têm régua customizada.
 */
export async function listCollectionRuleOverrides(context: AccessContext) {
  const rules = await prisma.collectionRule.findMany({
    where: { organizationId: context.organizationId, developmentId: { not: null } },
    include: { development: true, steps: { orderBy: { sequence: "asc" } } },
    orderBy: { development: { name: "asc" } },
  });
  return rules.filter((r) => canAccessDevelopment(context, r.developmentId));
}

/**
 * `developmentId: null` grava a régua geral da organização; um id grava a
 * régua daquele empreendimento específico. As etapas são sempre substituídas
 * por completo (delete-all-and-recreate), tanto pra régua geral quanto pra
 * régua por empreendimento.
 */
export async function upsertCollectionRule(context: AccessContext, developmentId: string | null, steps: CollectionStep[]) {
  if (steps.length === 0) throw new Error("A régua precisa ter ao menos uma etapa.");

  return prisma.$transaction(async (tx) => {
    if (developmentId) {
      const development = await tx.development.findFirst({
        where: { id: developmentId, organizationId: context.organizationId },
      });
      if (!development || !canAccessDevelopment(context, developmentId)) {
        throw new Error("Empreendimento inválido.");
      }
    }

    // `developmentId` é @unique (não composto) — a busca da linha geral usa
    // findFirst (não findUnique) porque não há chave única declarada sobre
    // (organizationId, developmentId nulo); a unicidade de "uma geral por
    // organização" é garantida aqui, na camada de serviço (find-then-create/
    // update dentro da mesma transação), mesmo padrão já usado em
    // distrato-rules.ts.
    const before = developmentId
      ? await tx.collectionRule.findUnique({ where: { developmentId }, include: { steps: true } })
      : await tx.collectionRule.findFirst({ where: { organizationId: context.organizationId, developmentId: null }, include: { steps: true } });

    const rule = before
      ? before
      : await tx.collectionRule.create({ data: { organizationId: context.organizationId, developmentId } });

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
