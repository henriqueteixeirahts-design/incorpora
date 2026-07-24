"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { createIndexRule, upsertIndexValue } from "@/server/index-rules";
import type { IndexCode } from "@/generated/prisma/client";

export type FormState = { error?: string };

export async function createIndexRuleAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "index_rule", "CREATE")) return { error: "Sem permissão." };

  const code = String(formData.get("code") ?? "") as IndexCode;
  const name = String(formData.get("name") ?? "").trim();
  if (!code || !name) return { error: "Informe o código e o nome do índice." };

  try {
    await createIndexRule(context, { code, name });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar índice." };
  }

  revalidatePath("/index-rules");
  return {};
}

export async function upsertIndexValueAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "index_rule", "EDIT")) return { error: "Sem permissão." };

  const indexRuleId = String(formData.get("indexRuleId") ?? "");
  const monthValue = String(formData.get("referenceMonth") ?? ""); // "YYYY-MM"
  const ratePercent = Number(formData.get("ratePercent"));

  if (!indexRuleId || !monthValue || Number.isNaN(ratePercent)) {
    return { error: "Preencha índice, mês e percentual." };
  }

  const [year, month] = monthValue.split("-").map(Number);
  const referenceMonth = new Date(year, month - 1, 1);

  try {
    await upsertIndexValue(context, { indexRuleId, referenceMonth, ratePercent });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao lançar valor do índice." };
  }

  revalidatePath("/index-rules");
  return {};
}
