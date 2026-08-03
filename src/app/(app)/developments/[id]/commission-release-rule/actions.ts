"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { upsertCommissionReleaseRule } from "@/server/commission-release-rules";
import type { CommissionReleaseTrigger } from "@/generated/prisma/client";

export type FormState = { error?: string; success?: boolean };

export async function upsertCommissionReleaseRuleAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "EDIT")) return { error: "Sem permissão." };

  const developmentId = String(formData.get("developmentId") ?? "");
  if (!developmentId) return { error: "Empreendimento inválido." };

  const trigger = String(formData.get("trigger") ?? "ON_CONTRACT_SIGNATURE") as CommissionReleaseTrigger;
  const installmentsPaidPercent = Number(formData.get("installmentsPaidPercent") ?? 50);

  if (!["ON_CONTRACT_SIGNATURE", "ON_DOWN_PAYMENT_RECEIVED", "ON_INSTALLMENTS_PAID_PERCENT"].includes(trigger)) {
    return { error: "Gatilho inválido." };
  }
  if (!Number.isInteger(installmentsPaidPercent) || installmentsPaidPercent < 1 || installmentsPaidPercent > 100) {
    return { error: "Percentual de parcelas pagas inválido (1 a 100)." };
  }

  try {
    await upsertCommissionReleaseRule(context, developmentId, { trigger, installmentsPaidPercent });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao salvar regra de liberação." };
  }

  revalidatePath(`/developments/${developmentId}/commission-release-rule`);
  return { success: true };
}
