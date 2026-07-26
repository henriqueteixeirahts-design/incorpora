"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  createPayable,
  updatePayable,
  getPayableDetail,
  advancePayableStatus,
  cancelPayable,
  uploadPayableDocument,
  deletePayableDocument,
  type CreatePayableInput,
} from "@/server/payables";
import type { PayableCategory, DocumentCategory } from "@/generated/prisma/client";

export type FormState = { error?: string; success?: boolean; payableId?: string };

function parsePayableInput(formData: FormData): CreatePayableInput | { error: string } {
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
  const bankAccount = String(formData.get("bankAccount") ?? "").trim() || undefined;
  const fiscalDocument = String(formData.get("fiscalDocument") ?? "").trim() || undefined;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  if (!category || !description || !competenceDateRaw || !dueDateRaw || Number.isNaN(amount)) {
    return { error: "Preencha categoria, descrição, competência, vencimento e valor." };
  }

  return {
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
    bankAccount,
    fiscalDocument,
    notes,
  };
}

export async function createPayableAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "payable", "CREATE")) return { error: "Sem permissão." };

  const input = parsePayableInput(formData);
  if ("error" in input) return input;

  try {
    const payable = await createPayable(context, input);
    revalidatePath("/payables");
    return { success: true, payableId: payable.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao lançar conta a pagar." };
  }
}

export async function updatePayableAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "payable", "EDIT")) return { error: "Sem permissão." };

  const payableId = String(formData.get("payableId") ?? "");
  if (!payableId) return { error: "Conta a pagar inválida." };

  const input = parsePayableInput(formData);
  if ("error" in input) return input;

  try {
    await updatePayable(context, payableId, input);
    revalidatePath("/payables");
    return { success: true, payableId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar conta a pagar." };
  }
}

export async function getPayableDetailAction(payableId: string) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "payable", "VIEW")) return null;
  return getPayableDetail(context.organizationId, payableId);
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

export async function uploadPayableDocumentAction(
  payableId: string,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "document", "CREATE")) return { error: "Sem permissão." };

  const file = formData.get("file");
  const category = String(formData.get("category") ?? "OTHER") as DocumentCategory;
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };

  try {
    await uploadPayableDocument(context, payableId, file, category);
    revalidatePath("/payables");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao enviar anexo." };
  }
}

export async function deletePayableDocumentAction(
  documentId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "document", "DELETE")) return { error: "Sem permissão." };

  try {
    await deletePayableDocument(context, documentId);
    revalidatePath("/payables");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao remover anexo." };
  }
}
