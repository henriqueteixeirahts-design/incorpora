"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerDetail,
  createCustomerContact,
  deleteCustomerContact,
  uploadCustomerDocument,
  deleteCustomerDocument,
  type CreateCustomerInput,
} from "@/server/customers";
import { deleteEntityDocumentFile } from "@/server/storage";
import type { CustomerType, DocumentCategory } from "@/generated/prisma/client";

export type FormState = { error?: string; success?: boolean; customerId?: string };

function parseCustomerInput(formData: FormData): CreateCustomerInput | { error: string } {
  const type = String(formData.get("type") ?? "INDIVIDUAL") as CustomerType;
  const name = String(formData.get("name") ?? "").trim();
  const document = String(formData.get("document") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name || !document) return { error: "Nome e documento são obrigatórios." };

  return {
    type,
    name,
    document,
    email: email || undefined,
    phone: phone || undefined,
    address: address || undefined,
    notes: notes || undefined,
  };
}

export async function createCustomerAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "customer", "CREATE")) return { error: "Sem permissão." };

  const input = parseCustomerInput(formData);
  if ("error" in input) return input;

  try {
    const customer = await createCustomer(context, input);
    revalidatePath("/customers");
    return { success: true, customerId: customer.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar cliente." };
  }
}

export async function updateCustomerAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "customer", "EDIT")) return { error: "Sem permissão." };

  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return { error: "Cliente inválido." };

  const input = parseCustomerInput(formData);
  if ("error" in input) return input;

  try {
    await updateCustomer(context, customerId, input);
    revalidatePath("/customers");
    return { success: true, customerId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar cliente." };
  }
}

export async function deleteCustomerAction(
  customerId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "customer", "DELETE")) return { error: "Sem permissão." };

  try {
    const { documentPaths } = await deleteCustomer(context, customerId);
    await Promise.all(documentPaths.map((path) => deleteEntityDocumentFile(path)));
    revalidatePath("/customers");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao excluir cliente." };
  }
}

export async function getCustomerDetailAction(customerId: string) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "customer", "VIEW")) return null;
  return getCustomerDetail(context.organizationId, customerId);
}

export async function createCustomerContactAction(
  customerId: string,
  input: { name: string; role?: string; email?: string; phone?: string },
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "customer", "EDIT")) return { error: "Sem permissão." };
  if (!input.name.trim()) return { error: "Nome do contato é obrigatório." };

  try {
    await createCustomerContact(context, customerId, input);
    revalidatePath("/customers");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao adicionar contato." };
  }
}

export async function deleteCustomerContactAction(
  contactId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "customer", "EDIT")) return { error: "Sem permissão." };

  try {
    await deleteCustomerContact(context, contactId);
    revalidatePath("/customers");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao remover contato." };
  }
}

export async function uploadCustomerDocumentAction(
  customerId: string,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "document", "CREATE")) return { error: "Sem permissão." };

  const file = formData.get("file");
  const category = String(formData.get("category") ?? "OTHER") as DocumentCategory;
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };

  try {
    await uploadCustomerDocument(context, customerId, file, category);
    revalidatePath("/customers");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao enviar anexo." };
  }
}

export async function deleteCustomerDocumentAction(
  documentId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "document", "DELETE")) return { error: "Sem permissão." };

  try {
    await deleteCustomerDocument(context, documentId);
    revalidatePath("/customers");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao remover anexo." };
  }
}
