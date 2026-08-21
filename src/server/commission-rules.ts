import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { canAccessDevelopment } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";
import type { InternalCommissionAppliesTo } from "@/generated/prisma/client";

/**
 * Percentuais de comissão das duas naturezas
 * (docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 3.1 e Parte 4) — geral
 * (organização) OU por empreendimento. Mesmo padrão de cascata das demais
 * regras parametrizáveis — ver comentário completo em `distrato-rules.ts`.
 * Sem default de código pros percentuais (diferente de DistratoRule): sem
 * uma regra configurada, não há comissão nenhuma resolvida (percent null) —
 * não faz sentido "adivinhar" uma taxa de comissão.
 */
export type CommissionRuleValues = {
  externalCommissionPercent: number | null;
  internalCommissionPercent: number | null;
  internalCommissionAppliesTo: InternalCommissionAppliesTo;
};

export const DEFAULT_COMMISSION_RULE: CommissionRuleValues = {
  externalCommissionPercent: null,
  internalCommissionPercent: null,
  internalCommissionAppliesTo: "ALL_SALES",
};

function toValues(rule: {
  externalCommissionPercent: unknown;
  internalCommissionPercent: unknown;
  internalCommissionAppliesTo: InternalCommissionAppliesTo;
}): CommissionRuleValues {
  return {
    externalCommissionPercent: rule.externalCommissionPercent === null ? null : Number(rule.externalCommissionPercent),
    internalCommissionPercent: rule.internalCommissionPercent === null ? null : Number(rule.internalCommissionPercent),
    internalCommissionAppliesTo: rule.internalCommissionAppliesTo,
  };
}

export async function getEffectiveCommissionRule(organizationId: string, developmentId: string): Promise<CommissionRuleValues> {
  const rule = await prisma.commissionRule.findUnique({ where: { developmentId } });
  if (rule) return toValues(rule);

  const general = await prisma.commissionRule.findFirst({ where: { organizationId, developmentId: null } });
  if (general) return toValues(general);

  return DEFAULT_COMMISSION_RULE;
}

/** Regra geral da organização, bruta (ou null se ainda não configurada). */
export function getGeneralCommissionRule(context: AccessContext) {
  return prisma.commissionRule.findFirst({ where: { organizationId: context.organizationId, developmentId: null } });
}

/** Regra bruta de um empreendimento (ou null) — pra distinguir "usando a geral/default" de "customizada" na tela. */
export function getCommissionRule(context: AccessContext, developmentId: string) {
  if (!canAccessDevelopment(context, developmentId)) return Promise.resolve(null);
  return prisma.commissionRule.findFirst({
    where: { developmentId, development: { organizationId: context.organizationId } },
  });
}

/**
 * Empreendimentos da organização que têm uma regra própria (sobrescrevem a
 * geral) — filtrado pelo `developmentAccess` do usuário, pra não vazar quais
 * empreendimentos fora do escopo dele têm regra customizada.
 */
export async function listCommissionRuleOverrides(context: AccessContext) {
  const rules = await prisma.commissionRule.findMany({
    where: { organizationId: context.organizationId, developmentId: { not: null } },
    include: { development: true },
    orderBy: { development: { name: "asc" } },
  });
  return rules.filter((r) => canAccessDevelopment(context, r.developmentId));
}

function assertPercentValid(value: number | null, label: string) {
  if (value === null) return;
  if (value < 0 || value > 100) throw new Error(`${label} inválido — precisa estar entre 0 e 100.`);
}

/**
 * `developmentId: null` grava a regra geral da organização; um id grava a
 * regra daquele empreendimento específico. Mesmo padrão find-then-create/
 * update dentro da transação já usado em `upsertDistratoRule` — unicidade
 * de "uma geral por organização" garantida na camada de serviço, não por
 * constraint de banco.
 */
export async function upsertCommissionRule(
  context: AccessContext,
  developmentId: string | null,
  input: CommissionRuleValues,
) {
  assertPercentValid(input.externalCommissionPercent, "Percentual de comissão externa");
  assertPercentValid(input.internalCommissionPercent, "Percentual de comissão interna");

  return prisma.$transaction(async (tx) => {
    if (developmentId) {
      const development = await tx.development.findFirst({
        where: { id: developmentId, organizationId: context.organizationId },
      });
      if (!development || !canAccessDevelopment(context, developmentId)) {
        throw new Error("Empreendimento inválido.");
      }
    }

    const before = developmentId
      ? await tx.commissionRule.findUnique({ where: { developmentId } })
      : await tx.commissionRule.findFirst({ where: { organizationId: context.organizationId, developmentId: null } });

    const rule = before
      ? await tx.commissionRule.update({ where: { id: before.id }, data: input })
      : await tx.commissionRule.create({ data: { organizationId: context.organizationId, developmentId, ...input } });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: before ? "update" : "create",
      entityType: "CommissionRule",
      entityId: rule.id,
      beforeData: before,
      afterData: rule,
    });

    return rule;
  });
}
