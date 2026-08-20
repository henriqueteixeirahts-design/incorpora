import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import type { AccessContext } from "@/server/auth-context";
import type { CommissionReleaseTrigger } from "@/generated/prisma/client";

/**
 * Regra de liberação de comissão — geral (organização) OU por empreendimento
 * (Fase A, Parte 4.1; docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 1.3).
 * Resolução em cascata: regra do empreendimento específico → regra geral da
 * organização → default do código. `developmentId: null` em
 * `upsertCommissionReleaseRule` grava/edita a linha geral.
 */
export type CommissionReleaseRuleValues = {
  trigger: CommissionReleaseTrigger;
  installmentsPaidPercent: number;
};

export const DEFAULT_COMMISSION_RELEASE_RULE: CommissionReleaseRuleValues = {
  trigger: "ON_CONTRACT_SIGNATURE",
  installmentsPaidPercent: 50,
};

function toValues(rule: { trigger: CommissionReleaseTrigger; installmentsPaidPercent: number }): CommissionReleaseRuleValues {
  return { trigger: rule.trigger, installmentsPaidPercent: rule.installmentsPaidPercent };
}

export async function getEffectiveCommissionReleaseRule(
  organizationId: string,
  developmentId: string,
): Promise<CommissionReleaseRuleValues> {
  const rule = await prisma.commissionReleaseRule.findUnique({ where: { developmentId } });
  if (rule) return toValues(rule);

  const general = await prisma.commissionReleaseRule.findFirst({ where: { organizationId, developmentId: null } });
  if (general) return toValues(general);

  return DEFAULT_COMMISSION_RELEASE_RULE;
}

/** Regra geral da organização, bruta (ou null se ainda não configurada). */
export function getGeneralCommissionReleaseRule(context: AccessContext) {
  return prisma.commissionReleaseRule.findFirst({ where: { organizationId: context.organizationId, developmentId: null } });
}

/** Regra bruta de um empreendimento (ou null) — pra distinguir "usando a geral/default" de "customizada" na tela. */
export function getCommissionReleaseRule(context: AccessContext, developmentId: string) {
  return prisma.commissionReleaseRule.findFirst({
    where: { developmentId, development: { organizationId: context.organizationId } },
  });
}

/** Empreendimentos da organização que têm uma regra própria (sobrescrevem a geral). */
export function listCommissionReleaseRuleOverrides(context: AccessContext) {
  return prisma.commissionReleaseRule.findMany({
    where: { organizationId: context.organizationId, developmentId: { not: null } },
    include: { development: true },
    orderBy: { development: { name: "asc" } },
  });
}

/**
 * `developmentId: null` grava a regra geral da organização; um id grava a
 * regra daquele empreendimento específico.
 */
export async function upsertCommissionReleaseRule(
  context: AccessContext,
  developmentId: string | null,
  input: CommissionReleaseRuleValues,
) {
  return prisma.$transaction(async (tx) => {
    if (developmentId) {
      const development = await tx.development.findFirst({
        where: { id: developmentId, organizationId: context.organizationId },
      });
      if (!development) throw new Error("Empreendimento inválido.");
    }

    // `developmentId` é @unique (não composto) — a busca da linha geral usa
    // findFirst (não findUnique) porque não há chave única declarada sobre
    // (organizationId, developmentId nulo); a unicidade de "uma geral por
    // organização" é garantida aqui, na camada de serviço (find-then-create/
    // update dentro da mesma transação), não por constraint de banco — mesmo
    // padrão de validação em serviço já usado no resto do projeto.
    const before = developmentId
      ? await tx.commissionReleaseRule.findUnique({ where: { developmentId } })
      : await tx.commissionReleaseRule.findFirst({ where: { organizationId: context.organizationId, developmentId: null } });

    const rule = before
      ? await tx.commissionReleaseRule.update({ where: { id: before.id }, data: input })
      : await tx.commissionReleaseRule.create({ data: { organizationId: context.organizationId, developmentId, ...input } });

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
