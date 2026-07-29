"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  getPermutante,
  createPermutante,
  updatePermutante,
  deletePermutante,
  DuplicatePermutanteDocumentError,
  type CreatePermutanteInput,
} from "@/server/permutantes";
import { onlyDigits, isValidDocument, isValidEmail, isValidBrazilianPhone } from "@/lib/br-validation";
import type { CustomerType } from "@/generated/prisma/client";

export type FormState = { error?: string; success?: boolean; permutanteId?: string; duplicatePermutanteId?: string };

function parsePermutanteInput(formData: FormData): CreatePermutanteInput | { error: string } {
  const type = String(formData.get("type") ?? "") as CustomerType;
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

  if (!["INDIVIDUAL", "COMPANY"].includes(type)) return { error: "Informe o tipo (PF/PJ)." };
  if (!name) return { error: "Informe o nome ou razão social." };
  if (!document || !isValidDocument(document, type)) {
    return { error: type === "COMPANY" ? "CNPJ inválido." : "CPF inválido." };
  }
  if (email && !isValidEmail(email)) return { error: "E-mail inválido." };
  if (phone && !isValidBrazilianPhone(phone)) return { error: "Telefone inválido — informe com DDD." };

  return {
    type,
    name,
    document,
    email: email || undefined,
    phone: phone || undefined,
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

export async function createPermutanteAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "permutante", "CREATE")) return { error: "Sem permissão." };

  const input = parsePermutanteInput(formData);
  if ("error" in input) return input;

  try {
    const permutante = await createPermutante(context, input);
    revalidatePath("/permutantes");
    return { success: true, permutanteId: permutante.id };
  } catch (error) {
    if (error instanceof DuplicatePermutanteDocumentError) {
      return { error: error.message, duplicatePermutanteId: error.permutanteId };
    }
    return { error: error instanceof Error ? error.message : "Falha ao criar permutante." };
  }
}

export async function updatePermutanteAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "permutante", "EDIT")) return { error: "Sem permissão." };

  const permutanteId = String(formData.get("permutanteId") ?? "");
  if (!permutanteId) return { error: "Permutante inválido." };

  const input = parsePermutanteInput(formData);
  if ("error" in input) return input;

  try {
    await updatePermutante(context, permutanteId, input);
    revalidatePath("/permutantes");
    return { success: true, permutanteId };
  } catch (error) {
    if (error instanceof DuplicatePermutanteDocumentError) {
      return { error: error.message, duplicatePermutanteId: error.permutanteId };
    }
    return { error: error instanceof Error ? error.message : "Falha ao atualizar permutante." };
  }
}

export async function deletePermutanteAction(permutanteId: string): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "permutante", "DELETE")) return { error: "Sem permissão." };

  try {
    await deletePermutante(context, permutanteId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao remover permutante." };
  }
  revalidatePath("/permutantes");
  return { success: true };
}

export async function getPermutanteDetailAction(permutanteId: string) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "permutante", "VIEW")) return null;
  return getPermutante(context.organizationId, permutanteId);
}
