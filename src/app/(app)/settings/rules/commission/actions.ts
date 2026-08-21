"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { upsertCommissionRule } from "@/server/commission-rules";
import type { InternalCommissionAppliesTo } from "@/generated/prisma/client";

export type CommissionRuleFormState = { error?: string; success?: boolean };

export async function upsertCommissionRuleAction(
  _prevState: CommissionRuleFormState,
  formData: FormData,
): Promise<CommissionRuleFormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "EDIT")) return { error: "Sem permissão." };

  const developmentId = String(formData.get("developmentId") ?? "").trim() || null;
  const externalRaw = String(formData.get("externalCommissionPercent") ?? "").trim();
  const internalRaw = String(formData.get("internalCommissionPercent") ?? "").trim();
  const appliesTo = String(formData.get("internalCommissionAppliesTo") ?? "ALL_SALES") as InternalCommissionAppliesTo;

  try {
    await upsertCommissionRule(context, developmentId, {
      externalCommissionPercent: externalRaw ? Number(externalRaw) : null,
      internalCommissionPercent: internalRaw ? Number(internalRaw) : null,
      internalCommissionAppliesTo: appliesTo === "PARTICIPATED_ONLY" ? "PARTICIPATED_ONLY" : "ALL_SALES",
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao salvar a regra de comissão." };
  }

  revalidatePath("/settings/rules/commission");
  return { success: true };
}
