import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { orgScope } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";
import type { ProposalEvaluationRuleValues } from "@/lib/proposal-evaluation";
import type { ApprovalLevel } from "@/generated/prisma/client";

const ENTITY_TYPE = "ProposalEvaluationRule";

/** Defaults sugeridos pela especificação (Parte 5.2) — valem quando o empreendimento ainda não tem regra configurada. */
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

/** Regra efetiva do empreendimento — a configurada, ou os defaults sugeridos quando não há linha ainda. */
export async function getEffectiveProposalEvaluationRule(
  developmentId: string,
): Promise<ProposalEvaluationRuleValues & { analysisApprovalLevels: ApprovalLevel[] }> {
  const rule = await prisma.proposalEvaluationRule.findUnique({ where: { developmentId } });
  if (!rule) return { ...DEFAULT_PROPOSAL_EVALUATION_RULE, analysisApprovalLevels: DEFAULT_ANALYSIS_APPROVAL_LEVELS };
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

/** Regra bruta (ou null se ainda não configurada) — pra distinguir "usando os defaults" de "customizada" na tela. */
export async function getProposalEvaluationRule(context: AccessContext, developmentId: string) {
  const development = await prisma.development.findFirst({
    where: { id: developmentId, ...orgScope(context) },
  });
  if (!development) return null;
  return prisma.proposalEvaluationRule.findUnique({ where: { developmentId } });
}

export type UpsertProposalEvaluationRuleInput = ProposalEvaluationRuleValues & {
  analysisApprovalLevels: ApprovalLevel[];
};

export async function upsertProposalEvaluationRule(
  context: AccessContext,
  developmentId: string,
  input: UpsertProposalEvaluationRuleInput,
) {
  const development = await prisma.development.findFirst({
    where: { id: developmentId, ...orgScope(context) },
  });
  if (!development) throw new Error("Empreendimento não encontrado.");

  const before = await prisma.proposalEvaluationRule.findUnique({ where: { developmentId } });

  return prisma.$transaction(async (tx) => {
    const rule = await tx.proposalEvaluationRule.upsert({
      where: { developmentId },
      create: { developmentId, ...input },
      update: input,
    });

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
