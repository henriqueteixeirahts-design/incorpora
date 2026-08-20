import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import type { AccessContext } from "@/server/auth-context";
import type { ProposalEvaluationRuleValues } from "@/lib/proposal-evaluation";
import type { ApprovalLevel } from "@/generated/prisma/client";

const ENTITY_TYPE = "ProposalEvaluationRule";

/**
 * Parâmetros de avaliação de propostas — geral (organização) OU por
 * empreendimento (docs/ESPEC_MODULO_COMERCIAL.md, Parte 5.2;
 * docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 1.3). Resolução em cascata:
 * regra do empreendimento específico → regra geral da organização → default
 * do código. `developmentId: null` em `upsertProposalEvaluationRule`
 * grava/edita a linha geral.
 */
export const DEFAULT_PROPOSAL_EVALUATION_RULE: ProposalEvaluationRuleValues = {
  allowOffTable: true,
  discountRatePercent: 1,
  discountRatePeriod: "MONTHLY",
  vplTolerancePercent: 3,
  vplAnalysisLimitPercent: 10,
  minDownPaymentPercent: 10,
  maxTermMonths: 120,
  maxPostKeysPercent: 30,
};

export const DEFAULT_ANALYSIS_APPROVAL_LEVELS: ApprovalLevel[] = ["SALES_MANAGER"];

export type FullProposalEvaluationRuleValues = ProposalEvaluationRuleValues & { analysisApprovalLevels: ApprovalLevel[] };

function toValues(rule: {
  allowOffTable: boolean;
  discountRatePercent: unknown;
  discountRatePeriod: ProposalEvaluationRuleValues["discountRatePeriod"];
  vplTolerancePercent: unknown;
  vplAnalysisLimitPercent: unknown;
  minDownPaymentPercent: unknown;
  maxTermMonths: number;
  maxPostKeysPercent: unknown;
  analysisApprovalLevels: ApprovalLevel[];
}): FullProposalEvaluationRuleValues {
  return {
    allowOffTable: rule.allowOffTable,
    discountRatePercent: Number(rule.discountRatePercent),
    discountRatePeriod: rule.discountRatePeriod,
    vplTolerancePercent: Number(rule.vplTolerancePercent),
    vplAnalysisLimitPercent: Number(rule.vplAnalysisLimitPercent),
    minDownPaymentPercent: Number(rule.minDownPaymentPercent),
    maxTermMonths: rule.maxTermMonths,
    maxPostKeysPercent: Number(rule.maxPostKeysPercent),
    analysisApprovalLevels: rule.analysisApprovalLevels,
  };
}

/** Regra efetiva — a do empreendimento, ou a geral da organização, ou os defaults sugeridos quando nenhuma foi configurada. */
export async function getEffectiveProposalEvaluationRule(
  organizationId: string,
  developmentId: string,
): Promise<FullProposalEvaluationRuleValues> {
  const rule = await prisma.proposalEvaluationRule.findUnique({ where: { developmentId } });
  if (rule) return toValues(rule);

  const general = await prisma.proposalEvaluationRule.findFirst({ where: { organizationId, developmentId: null } });
  if (general) return toValues(general);

  return { ...DEFAULT_PROPOSAL_EVALUATION_RULE, analysisApprovalLevels: DEFAULT_ANALYSIS_APPROVAL_LEVELS };
}

/** Regra geral da organização, bruta (ou null se ainda não configurada). */
export function getGeneralProposalEvaluationRule(context: AccessContext) {
  return prisma.proposalEvaluationRule.findFirst({ where: { organizationId: context.organizationId, developmentId: null } });
}

/** Regra bruta de um empreendimento (ou null) — pra distinguir "usando a geral/default" de "customizada" na tela. */
export function getProposalEvaluationRule(context: AccessContext, developmentId: string) {
  return prisma.proposalEvaluationRule.findFirst({
    where: { developmentId, development: { organizationId: context.organizationId } },
  });
}

/** Empreendimentos da organização que têm uma regra própria (sobrescrevem a geral). */
export function listProposalEvaluationRuleOverrides(context: AccessContext) {
  return prisma.proposalEvaluationRule.findMany({
    where: { organizationId: context.organizationId, developmentId: { not: null } },
    include: { development: true },
    orderBy: { development: { name: "asc" } },
  });
}

export type UpsertProposalEvaluationRuleInput = ProposalEvaluationRuleValues & {
  analysisApprovalLevels: ApprovalLevel[];
};

/**
 * `developmentId: null` grava a regra geral da organização; um id grava a
 * regra daquele empreendimento específico.
 */
export async function upsertProposalEvaluationRule(
  context: AccessContext,
  developmentId: string | null,
  input: UpsertProposalEvaluationRuleInput,
) {
  return prisma.$transaction(async (tx) => {
    if (developmentId) {
      const development = await tx.development.findFirst({
        where: { id: developmentId, organizationId: context.organizationId },
      });
      if (!development) throw new Error("Empreendimento não encontrado.");
    }

    // `developmentId` é @unique (não composto) — a busca da linha geral usa
    // findFirst (não findUnique) porque não há chave única declarada sobre
    // (organizationId, developmentId nulo); a unicidade de "uma geral por
    // organização" é garantida aqui, na camada de serviço (find-then-create/
    // update dentro da mesma transação), mesmo padrão usado em
    // src/server/distrato-rules.ts.
    const before = developmentId
      ? await tx.proposalEvaluationRule.findUnique({ where: { developmentId } })
      : await tx.proposalEvaluationRule.findFirst({ where: { organizationId: context.organizationId, developmentId: null } });

    const rule = before
      ? await tx.proposalEvaluationRule.update({ where: { id: before.id }, data: input })
      : await tx.proposalEvaluationRule.create({ data: { organizationId: context.organizationId, developmentId, ...input } });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: before ? "update" : "create",
      entityType: ENTITY_TYPE,
      entityId: rule.id,
      beforeData: before ?? undefined,
      afterData: rule,
    });

    return rule;
  });
}
