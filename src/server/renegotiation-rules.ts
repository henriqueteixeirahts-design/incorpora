import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import type { AccessContext } from "@/server/auth-context";
import type { ApprovalLevel } from "@/generated/prisma/client";

/**
 * Regra de renegociação de parcelas — geral (organização) OU por
 * empreendimento (Fase B, Parte 2.2; docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md,
 * Parte 1.3). Resolução em cascata: regra do empreendimento específico →
 * regra geral da organização → default do código. `developmentId: null` em
 * `upsertRenegotiationRule` grava/edita a linha geral.
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

function toValues(rule: {
  maxDiscountOnChargesPercent: unknown;
  maxTermMonths: number;
  brokenDealGraceDays: number;
  reactivateOriginalOnBreak: boolean;
  approvalLevels: ApprovalLevel[];
}): RenegotiationRuleValues {
  return {
    maxDiscountOnChargesPercent: Number(rule.maxDiscountOnChargesPercent),
    maxTermMonths: rule.maxTermMonths,
    brokenDealGraceDays: rule.brokenDealGraceDays,
    reactivateOriginalOnBreak: rule.reactivateOriginalOnBreak,
    approvalLevels: rule.approvalLevels,
  };
}

export async function getEffectiveRenegotiationRule(organizationId: string, developmentId: string): Promise<RenegotiationRuleValues> {
  const rule = await prisma.renegotiationRule.findUnique({ where: { developmentId } });
  if (rule) return toValues(rule);

  const general = await prisma.renegotiationRule.findFirst({ where: { organizationId, developmentId: null } });
  if (general) return toValues(general);

  return DEFAULT_RENEGOTIATION_RULE;
}

/** Regra geral da organização, bruta (ou null se ainda não configurada). */
export function getGeneralRenegotiationRule(context: AccessContext) {
  return prisma.renegotiationRule.findFirst({ where: { organizationId: context.organizationId, developmentId: null } });
}

/** Regra bruta de um empreendimento (ou null) — pra distinguir "usando a geral/default" de "customizada" na tela. */
export function getRenegotiationRule(context: AccessContext, developmentId: string) {
  return prisma.renegotiationRule.findFirst({
    where: { developmentId, development: { organizationId: context.organizationId } },
  });
}

/** Empreendimentos da organização que têm uma regra própria (sobrescrevem a geral). */
export function listRenegotiationRuleOverrides(context: AccessContext) {
  return prisma.renegotiationRule.findMany({
    where: { organizationId: context.organizationId, developmentId: { not: null } },
    include: { development: true },
    orderBy: { development: { name: "asc" } },
  });
}

/**
 * `developmentId: null` grava a regra geral da organização; um id grava a
 * regra daquele empreendimento específico.
 */
export async function upsertRenegotiationRule(
  context: AccessContext,
  developmentId: string | null,
  input: RenegotiationRuleValues,
) {
  if (input.approvalLevels.length === 0) {
    throw new Error("Selecione ao menos um nível de aprovação pra descontos acima da tolerância.");
  }

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
      ? await tx.renegotiationRule.findUnique({ where: { developmentId } })
      : await tx.renegotiationRule.findFirst({ where: { organizationId: context.organizationId, developmentId: null } });

    const rule = before
      ? await tx.renegotiationRule.update({ where: { id: before.id }, data: input })
      : await tx.renegotiationRule.create({ data: { organizationId: context.organizationId, developmentId, ...input } });

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
