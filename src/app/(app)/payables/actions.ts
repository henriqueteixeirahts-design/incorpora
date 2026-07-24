"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { createPayable, advancePayableStatus, cancelPayable } from "@/server/payables";
import type { PayableCategory } from "@/generated/prisma/client";

export type FormState = { error?: string };

export async function createPayableAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "payable", "CREATE")) return { error: "Sem permissão." };

  const developmentId = String(formData.get("developmentId") ?? "").trim() || undefined;
  const speId = String(formData.get("speId") ?? "").trim() || undefined;
  const supplierId = String(formData.get("supplierId") ?? "").trim() || undefined;
  const costCenterId = String(formData.get("costCenterId") ?? "").trim() || undefined;
  const category = String(formData.get("category") ?? "") as PayableCategory;
  const description = String(formData.get("description") ?? "").trim();
  const competenceDateRaw = String(formData.get("competenceDate") ?? "");
  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const amount = Number(formData.get("amount"));
  const paymentMethod = String(formData.get("paymentMethod") ?? "").trim() || undefined;
  const fiscalDocument = String(formData.get("fiscalDocument") ?? "").trim() || undefined;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  if (!category || !description || !competenceDateRaw || !dueDateRaw || Number.isNaN(amount)) {
    return { error: "Preencha categoria, descrição, competência, vencimento e valor." };
  }

  try {
    await createPayable(context, {
      developmentId,
      speId,
      supplierId,
      costCenterId,
      category,
      description,
      competenceDate: new Date(competenceDateRaw),
      dueDate: new Date(dueDateRaw),
      amount,
      paymentMethod,
      fiscalDocument,
      notes,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao lançar conta a pagar." };
  }

  revalidatePath("/payables");
  return {};
}

export async function advancePayableStatusAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "payable", "APPROVE")) return;

  const payableId = String(formData.get("payableId") ?? "");
  if (!payableId) return;

  await advancePayableStatus(context, payableId);
  revalidatePath("/payables");
}

export async function cancelPayableAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "payable", "CANCEL")) return;

  const payableId = String(formData.get("payableId") ?? "");
  if (!payableId) return;

  await cancelPayable(context, payableId);
  revalidatePath("/payables");
}
