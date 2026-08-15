"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { upsertRenegotiationRule } from "@/server/renegotiation-rules";
import type { ApprovalLevel } from "@/generated/prisma/client";

export type FormState = { error?: string; success?: boolean };

export async function upsertRenegotiationRuleAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "EDIT")) return { error: "Sem permissão." };

  const developmentId = String(formData.get("developmentId") ?? "");
  if (!developmentId) return { error: "Empreendimento inválido." };

  const maxDiscountOnChargesPercent = Number(formData.get("maxDiscountOnChargesPercent") ?? 20);
  const maxTermMonths = Number(formData.get("maxTermMonths") ?? 24);
  const brokenDealGraceDays = Number(formData.get("brokenDealGraceDays") ?? 15);
  const reactivateOriginalOnBreak = formData.get("reactivateOriginalOnBreak") === "on";
  const approvalLevels = formData.getAll("approvalLevels").map(String) as ApprovalLevel[];

  if (maxDiscountOnChargesPercent < 0 || maxDiscountOnChargesPercent > 100) {
    return { error: "Tolerância de desconto inválida (0 a 100%)." };
  }
  if (!Number.isInteger(maxTermMonths) || maxTermMonths < 1) return { error: "Prazo máximo inválido." };
  if (!Number.isInteger(brokenDealGraceDays) || brokenDealGraceDays < 1) return { error: "Dias pra acordo quebrado inválido." };

  try {
    await upsertRenegotiationRule(context, developmentId, {
      maxDiscountOnChargesPercent,
      maxTermMonths,
      brokenDealGraceDays,
      reactivateOriginalOnBreak,
      approvalLevels,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao salvar a regra." };
  }

  revalidatePath(`/developments/${developmentId}/renegotiation-rule`);
  return { success: true };
}
