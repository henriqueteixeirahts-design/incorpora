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
  DuplicateDocumentError,
  type CreateCustomerInput,
} from "@/server/customers";
import { deleteEntityDocumentFile } from "@/server/storage";
import { onlyDigits, isValidDocument, isValidEmail, isValidBrazilianPhone } from "@/lib/br-validation";
import type { CustomerType, DocumentCategory } from "@/generated/prisma/client";

export type FormState = {
  error?: string;
  success?: boolean;
  customerId?: string;
  duplicateCustomerId?: string;
};

function parseCustomerInput(formData: FormData): CreateCustomerInput | { error: string } {
  const type = String(formData.get("type") ?? "INDIVIDUAL") as CustomerType;
  const name = String(formData.get("name") ?? "").trim();
  const document = onlyDigits(String(formData.get("document") ?? ""));
  const email = String(formData.get("email") ?? "").trim();
  const phone = onlyDigits(String(formData.get("phone") ?? ""));
  const zipCode = onlyDigits(String(formData.get("zipCode") ?? ""));
  const street = String(formData.get("street") ?? "").trim();
  const number = String(formData.get("number") ?? "").trim();
  const complement = String(formData.get("complement") ?? "").trim();
  const neighborhood = String(formData.get("neighborhood") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim().toUpperCase();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) return { error: "Nome é obrigatório." };
  if (!document || !isValidDocument(document, type)) {
    return {
      error: type === "COMPANY" ? "CNPJ inválido — verifique os dígitos." : "CPF inválido — verifique os dígitos.",
    };
  }
  if (!email || !isValidEmail(email)) return { error: "Informe um e-mail válido." };
  if (!phone || !isValidBrazilianPhone(phone)) return { error: "Informe um telefone válido, com DDD." };

  return {
    type,
    name,
    document,
    email,
    phone,
    zipCode: zipCode || undefined,
    street: street || undefined,
    number: number || undefined,
    complement: complement || undefined,
    neighborhood: neighborhood || undefined,
    city: city || undefined,
    state: state || undefined,
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
    if (error instanceof DuplicateDocumentError) {
      return { error: error.message, duplicateCustomerId: error.customerId };
    }
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
    if (error instanceof DuplicateDocumentError) {
      return { error: error.message, duplicateCustomerId: error.customerId };
    }
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

  const name = input.name.trim();
  const email = input.email?.trim();
  const phone = input.phone ? onlyDigits(input.phone) : undefined;

  if (!name) return { error: "Nome do contato é obrigatório." };
  if (!email && !phone) return { error: "Informe pelo menos um e-mail ou telefone para o contato." };
  if (email && !isValidEmail(email)) return { error: "E-mail do contato inválido." };
  if (phone && !isValidBrazilianPhone(phone)) return { error: "Telefone do contato inválido." };

  try {
    await createCustomerContact(context, customerId, {
      name,
      role: input.role?.trim() || undefined,
      email: email || undefined,
      phone: phone || undefined,
    });
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
