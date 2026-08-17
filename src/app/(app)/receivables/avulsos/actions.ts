"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  createReceivable,
  updateReceivable,
  getReceivableDetail,
  registerReceivableReceipt,
  cancelReceivable,
  type CreateReceivableInput,
} from "@/server/receivables-avulsos";
import type { ReceivableCategory } from "@/generated/prisma/client";

export type FormState = { error?: string; success?: boolean; receivableId?: string };

function parseReceivableInput(formData: FormData): CreateReceivableInput | { error: string } {
  const developmentId = String(formData.get("developmentId") ?? "").trim() || undefined;
  const speId = String(formData.get("speId") ?? "").trim() || undefined;
  const customerId = String(formData.get("customerId") ?? "").trim() || undefined;
  const category = String(formData.get("category") ?? "") as ReceivableCategory;
  const origin = String(formData.get("origin") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const amount = Number(formData.get("amount"));
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  if (!category || !origin || !dueDateRaw || Number.isNaN(amount)) {
    return { error: "Preencha categoria, origem, vencimento e valor." };
  }

  return { developmentId, speId, customerId, category, origin, dueDate: new Date(dueDateRaw), amount, notes };
}

export async function createReceivableAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "installment", "CREATE")) return { error: "Sem permissão." };

  const input = parseReceivableInput(formData);
  if ("error" in input) return input;

  try {
    const receivable = await createReceivable(context, input);
    revalidatePath("/receivables/avulsos");
    return { success: true, receivableId: receivable.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao lançar recebível." };
  }
}

export async function updateReceivableAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "installment", "EDIT")) return { error: "Sem permissão." };

  const receivableId = String(formData.get("receivableId") ?? "");
  if (!receivableId) return { error: "Recebível inválido." };

  const input = parseReceivableInput(formData);
  if ("error" in input) return input;

  try {
    await updateReceivable(context, receivableId, input);
    revalidatePath("/receivables/avulsos");
    return { success: true, receivableId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar recebível." };
  }
}

export async function getReceivableDetailAction(receivableId: string) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "installment", "VIEW")) return null;
  return getReceivableDetail(context.organizationId, receivableId);
}

export async function registerReceivableReceiptAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "installment", "EDIT")) return;

  const receivableId = String(formData.get("receivableId") ?? "");
  if (!receivableId) return;

  const receivedAtRaw = String(formData.get("receivedAt") ?? "");
  const receivedAmountRaw = String(formData.get("receivedAmount") ?? "");

  await registerReceivableReceipt(context, receivableId, {
    receivedAt: receivedAtRaw ? new Date(receivedAtRaw) : undefined,
    receivedAmount: receivedAmountRaw ? Number(receivedAmountRaw) : undefined,
  });
  revalidatePath("/receivables/avulsos");
}

export async function cancelReceivableAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "installment", "EDIT")) return;

  const receivableId = String(formData.get("receivableId") ?? "");
  if (!receivableId) return;

  await cancelReceivable(context, receivableId);
  revalidatePath("/receivables/avulsos");
}
