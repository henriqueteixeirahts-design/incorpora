"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { upsertProposalEvaluationRule, type UpsertProposalEvaluationRuleInput } from "@/server/proposal-evaluation-rules";
import type { ApprovalLevel, RatePeriod } from "@/generated/prisma/client";

export type FormState = { error?: string; success?: boolean };

function parseInput(formData: FormData): UpsertProposalEvaluationRuleInput | { error: string } {
  const allowOffTable = formData.get("allowOffTable") === "on";
  const discountRatePercent = Number(formData.get("discountRatePercent") ?? 1);
  const discountRatePeriod = String(formData.get("discountRatePeriod") ?? "MONTHLY") as RatePeriod;
  const vplTolerancePercent = Number(formData.get("vplTolerancePercent") ?? 3);
  const vplAnalysisLimitPercent = Number(formData.get("vplAnalysisLimitPercent") ?? 10);
  const minDownPaymentPercent = Number(formData.get("minDownPaymentPercent") ?? 10);
  const maxTermMonths = Number(formData.get("maxTermMonths") ?? 120);
  const maxPostKeysPercent = Number(formData.get("maxPostKeysPercent") ?? 30);
  const analysisApprovalLevels = formData.getAll("analysisApprovalLevels").map(String) as ApprovalLevel[];

  if (Number.isNaN(discountRatePercent) || discountRatePercent < 0) {
    return { error: "Taxa de desconto inválida." };
  }
  if (Number.isNaN(vplTolerancePercent) || vplTolerancePercent < 0) {
    return { error: "Tolerância de VPL inválida." };
  }
  if (Number.isNaN(vplAnalysisLimitPercent) || vplAnalysisLimitPercent < vplTolerancePercent) {
    return { error: "Limite de deságio para análise deve ser maior ou igual à tolerância." };
  }
  if (Number.isNaN(minDownPaymentPercent) || minDownPaymentPercent < 0 || minDownPaymentPercent > 100) {
    return { error: "Entrada mínima inválida." };
  }
  if (!Number.isInteger(maxTermMonths) || maxTermMonths <= 0) {
    return { error: "Prazo máximo inválido." };
  }
  if (Number.isNaN(maxPostKeysPercent) || maxPostKeysPercent < 0 || maxPostKeysPercent > 100) {
    return { error: "Percentual máximo pós-chaves inválido." };
  }
  if (analysisApprovalLevels.length === 0) {
    return { error: "Selecione ao menos um papel pra analisar propostas pendentes." };
  }

  return {
    allowOffTable,
    discountRatePercent,
    discountRatePeriod,
    vplTolerancePercent,
    vplAnalysisLimitPercent,
    minDownPaymentPercent,
    maxTermMonths,
    maxPostKeysPercent,
    analysisApprovalLevels,
  };
}

/** `developmentId` vazio/ausente = parâmetros gerais da organização (chamado também de /settings/rules/proposal-evaluation). */
export async function upsertProposalEvaluationRuleAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "EDIT")) return { error: "Sem permissão." };

  const developmentId = String(formData.get("developmentId") ?? "").trim() || null;

  const input = parseInput(formData);
  if ("error" in input) return input;

  try {
    await upsertProposalEvaluationRule(context, developmentId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao salvar regras de avaliação." };
  }
  revalidatePath(
    developmentId ? `/developments/${developmentId}/proposal-evaluation-rules` : "/settings/rules/proposal-evaluation",
  );
  return { success: true };
}
