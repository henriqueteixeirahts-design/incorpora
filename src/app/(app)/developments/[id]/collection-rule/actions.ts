"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { upsertCollectionRule, type CollectionStep } from "@/server/collection-rules";

export type FormState = { error?: string; success?: boolean };

/** `developmentId` vazio/ausente = régua geral da organização (chamado também de /settings/rules/collection). */
export async function upsertCollectionRuleAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "EDIT")) return { error: "Sem permissão." };

  const developmentId = String(formData.get("developmentId") ?? "").trim() || null;

  const stepsRaw = String(formData.get("stepsJson") ?? "[]");
  let steps: CollectionStep[];
  try {
    const parsed = JSON.parse(stepsRaw) as { offsetDays: number; actionLabel: string }[];
    steps = parsed.map((s, index) => ({ sequence: index + 1, offsetDays: Number(s.offsetDays), actionLabel: String(s.actionLabel).trim() }));
  } catch {
    return { error: "Etapas inválidas." };
  }

  if (steps.some((s) => !s.actionLabel || Number.isNaN(s.offsetDays))) {
    return { error: "Preencha o prazo e a ação de cada etapa." };
  }

  try {
    await upsertCollectionRule(context, developmentId, steps);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao salvar a régua." };
  }

  revalidatePath(developmentId ? `/developments/${developmentId}/collection-rule` : "/settings/rules/collection");
  return { success: true };
}
