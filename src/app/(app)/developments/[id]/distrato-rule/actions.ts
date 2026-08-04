"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { upsertDistratoRule } from "@/server/distrato-rules";

export type FormState = { error?: string; success?: boolean };

export async function upsertDistratoRuleAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "EDIT")) return { error: "Sem permissão." };

  const developmentId = String(formData.get("developmentId") ?? "");
  if (!developmentId) return { error: "Empreendimento inválido." };

  const retentionPercent = Number(formData.get("retentionPercent") ?? 25);
  const reverseCommissionOnDistrato = formData.get("reverseCommissionOnDistrato") === "on";

  if (Number.isNaN(retentionPercent) || retentionPercent < 0) {
    return { error: "Percentual de retenção inválido." };
  }

  try {
    await upsertDistratoRule(context, developmentId, { retentionPercent, reverseCommissionOnDistrato });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao salvar regra de distrato." };
  }

  revalidatePath(`/developments/${developmentId}/distrato-rule`);
  return { success: true };
}
