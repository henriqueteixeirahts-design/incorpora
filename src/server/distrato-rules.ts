import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { maxRetentionPercent } from "@/lib/distrato-settlement";
import { canAccessDevelopment } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";

/**
 * Regra de distrato — geral (organização) OU por empreendimento (Fase A,
 * Parte 2.4; docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 1.3). Resolução em
 * cascata: regra do empreendimento específico → regra geral da organização
 * → default do código. `developmentId: null` em `upsertDistratoRule`
 * grava/edita a linha geral.
 */
export type DistratoRuleValues = {
  retentionPercent: number;
  reverseCommissionOnDistrato: boolean;
};

export const DEFAULT_DISTRATO_RULE: DistratoRuleValues = {
  retentionPercent: 25,
  reverseCommissionOnDistrato: true,
};

function toValues(rule: { retentionPercent: unknown; reverseCommissionOnDistrato: boolean }): DistratoRuleValues {
  return { retentionPercent: Number(rule.retentionPercent), reverseCommissionOnDistrato: rule.reverseCommissionOnDistrato };
}

export async function getEffectiveDistratoRule(organizationId: string, developmentId: string): Promise<DistratoRuleValues> {
  const rule = await prisma.distratoRule.findUnique({ where: { developmentId } });
  if (rule) return toValues(rule);

  const general = await prisma.distratoRule.findFirst({ where: { organizationId, developmentId: null } });
  if (general) return toValues(general);

  return DEFAULT_DISTRATO_RULE;
}

/** Regra geral da organização, bruta (ou null se ainda não configurada). */
export function getGeneralDistratoRule(context: AccessContext) {
  return prisma.distratoRule.findFirst({ where: { organizationId: context.organizationId, developmentId: null } });
}

/** Regra bruta de um empreendimento (ou null) — pra distinguir "usando a geral/default" de "customizada" na tela. */
export function getDistratoRule(context: AccessContext, developmentId: string) {
  if (!canAccessDevelopment(context, developmentId)) return Promise.resolve(null);
  return prisma.distratoRule.findFirst({
    where: { developmentId, development: { organizationId: context.organizationId } },
  });
}

/**
 * Empreendimentos da organização que têm uma regra própria (sobrescrevem a
 * geral) — filtrado pelo `developmentAccess` do usuário, pra não vazar quais
 * empreendimentos fora do escopo dele têm regra customizada.
 */
export async function listDistratoRuleOverrides(context: AccessContext) {
  const rules = await prisma.distratoRule.findMany({
    where: { organizationId: context.organizationId, developmentId: { not: null } },
    include: { development: true },
    orderBy: { development: { name: "asc" } },
  });
  return rules.filter((r) => canAccessDevelopment(context, r.developmentId));
}

/**
 * `developmentId: null` grava a regra geral da organização; um id grava a
 * regra daquele empreendimento específico. O teto legal (Lei 13.786/18)
 * depende de `Development.hasPropertyAffectation` — pra regra geral, que não
 * está presa a um empreendimento, usa o teto mais conservador (25%, "sem
 * patrimônio de afetação") como limite seguro.
 */
export async function upsertDistratoRule(
  context: AccessContext,
  developmentId: string | null,
  input: DistratoRuleValues,
) {
  return prisma.$transaction(async (tx) => {
    let cap = 25;
    if (developmentId) {
      const development = await tx.development.findFirst({
        where: { id: developmentId, organizationId: context.organizationId },
      });
      if (!development || !canAccessDevelopment(context, developmentId)) {
        throw new Error("Empreendimento inválido.");
      }
      cap = maxRetentionPercent(development.hasPropertyAffectation);
    }

    if (input.retentionPercent < 0 || input.retentionPercent > cap) {
      throw new Error(`Retenção inválida — o teto legal (Lei 13.786/18) é ${cap}% nesta regra.`);
    }

    // `developmentId` é @unique (não composto) — a busca da linha geral usa
    // findFirst (não findUnique) porque não há chave única declarada sobre
    // (organizationId, developmentId nulo); a unicidade de "uma geral por
    // organização" é garantida aqui, na camada de serviço (find-then-create/
    // update dentro da mesma transação), não por constraint de banco — mesmo
    // padrão de validação em serviço já usado no resto do projeto.
    const before = developmentId
      ? await tx.distratoRule.findUnique({ where: { developmentId } })
      : await tx.distratoRule.findFirst({ where: { organizationId: context.organizationId, developmentId: null } });

    const rule = before
      ? await tx.distratoRule.update({ where: { id: before.id }, data: input })
      : await tx.distratoRule.create({ data: { organizationId: context.organizationId, developmentId, ...input } });

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
