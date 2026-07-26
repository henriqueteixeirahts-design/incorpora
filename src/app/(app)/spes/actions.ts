"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  createSpe,
  updateSpe,
  deleteSpe,
  getSpeDetail,
  DuplicateSpeDocumentError,
  type CreateSpeInput,
} from "@/server/spes";
import { onlyDigits, isValidCnpj, isValidEmail, isValidBrazilianPhone } from "@/lib/br-validation";
import type { SpeStatus } from "@/generated/prisma/client";
import {
  listActiveBankAccounts,
  linkSpeBankAccount,
  unlinkSpeBankAccount,
  setPrimarySpeBankAccount,
} from "@/server/bank-accounts";

export type CreateSpeState = {
  error?: string;
  success?: boolean;
  speId?: string;
  duplicateSpeId?: string;
};

function parseSpeInput(formData: FormData): CreateSpeInput | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const tradeName = String(formData.get("tradeName") ?? "").trim();
  const document = onlyDigits(String(formData.get("document") ?? ""));
  const nire = String(formData.get("nire") ?? "").trim();
  const foundedAtRaw = String(formData.get("foundedAt") ?? "");
  const legalNature = String(formData.get("legalNature") ?? "").trim();
  const cnae = String(formData.get("cnae") ?? "").trim();
  const status = String(formData.get("status") ?? "ACTIVE") as SpeStatus;
  const email = String(formData.get("email") ?? "").trim();
  const phone = onlyDigits(String(formData.get("phone") ?? ""));
  const website = String(formData.get("website") ?? "").trim();
  const zipCode = onlyDigits(String(formData.get("zipCode") ?? ""));
  const street = String(formData.get("street") ?? "").trim();
  const number = String(formData.get("number") ?? "").trim();
  const complement = String(formData.get("complement") ?? "").trim();
  const neighborhood = String(formData.get("neighborhood") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim().toUpperCase();

  if (!name) return { error: "Razão social é obrigatória." };
  if (!document || !isValidCnpj(document)) return { error: "CNPJ inválido — verifique os dígitos." };
  if (!status) return { error: "Situação é obrigatória." };
  if (!email || !isValidEmail(email)) return { error: "Informe um e-mail válido." };
  if (!phone || !isValidBrazilianPhone(phone)) return { error: "Informe um telefone válido, com DDD." };

  return {
    name,
    tradeName: tradeName || undefined,
    document,
    nire: nire || undefined,
    foundedAt: foundedAtRaw ? new Date(foundedAtRaw) : undefined,
    legalNature: legalNature || undefined,
    cnae: cnae || undefined,
    status,
    email,
    phone,
    website: website || undefined,
    zipCode: zipCode || undefined,
    street: street || undefined,
    number: number || undefined,
    complement: complement || undefined,
    neighborhood: neighborhood || undefined,
    city: city || undefined,
    state: state || undefined,
  };
}

export async function createSpeAction(
  _prevState: CreateSpeState,
  formData: FormData,
): Promise<CreateSpeState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "CREATE")) {
    return { error: "Você não tem permissão para criar SPEs." };
  }

  const input = parseSpeInput(formData);
  if ("error" in input) return input;

  try {
    const spe = await createSpe(context, input);
    revalidatePath("/spes");
    return { success: true, speId: spe.id };
  } catch (error) {
    if (error instanceof DuplicateSpeDocumentError) {
      return { error: error.message, duplicateSpeId: error.speId };
    }
    return { error: error instanceof Error ? error.message : "Falha ao criar SPE." };
  }
}

export async function updateSpeAction(
  _prevState: CreateSpeState,
  formData: FormData,
): Promise<CreateSpeState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) {
    return { error: "Você não tem permissão para editar SPEs." };
  }

  const speId = String(formData.get("speId") ?? "");
  if (!speId) return { error: "SPE inválida." };

  const input = parseSpeInput(formData);
  if ("error" in input) return input;

  try {
    await updateSpe(context, speId, input);
    revalidatePath("/spes");
    return { success: true, speId };
  } catch (error) {
    if (error instanceof DuplicateSpeDocumentError) {
      return { error: error.message, duplicateSpeId: error.speId };
    }
    return { error: error instanceof Error ? error.message : "Falha ao atualizar SPE." };
  }
}

export async function deleteSpeAction(
  speId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "DELETE")) {
    return { error: "Você não tem permissão para excluir SPEs." };
  }

  try {
    await deleteSpe(context, speId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao excluir SPE." };
  }

  revalidatePath("/spes");
  return { success: true };
}

export async function getSpeDetailAction(speId: string) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "VIEW")) return null;
  return getSpeDetail(context.organizationId, speId);
}

export async function getActiveBankAccountsAction() {
  const context = await requireAccessContext();
  if (!hasPermission(context, "bank_account", "VIEW")) return [];
  return listActiveBankAccounts(context.organizationId);
}

export async function linkSpeBankAccountAction(
  speId: string,
  bankAccountId: string,
  isPrimary: boolean,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  try {
    await linkSpeBankAccount(context, speId, bankAccountId, isPrimary);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao vincular conta." };
  }
  revalidatePath("/spes");
  return { success: true };
}

export async function unlinkSpeBankAccountAction(
  speId: string,
  bankAccountId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  try {
    await unlinkSpeBankAccount(context, speId, bankAccountId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao desvincular conta." };
  }
  revalidatePath("/spes");
  return { success: true };
}

export async function setPrimarySpeBankAccountAction(
  speId: string,
  bankAccountId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  try {
    await setPrimarySpeBankAccount(context, speId, bankAccountId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao definir conta principal." };
  }
  revalidatePath("/spes");
  return { success: true };
}
