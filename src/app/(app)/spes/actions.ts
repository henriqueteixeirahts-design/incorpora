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
import { onlyDigits, isValidCnpj, isValidEmail, isValidBrazilianPhone, isValidDocument } from "@/lib/br-validation";
import type { SpeStatus, SpeDocumentHolderType, SpePartnerRole, SpeInvestorModality } from "@/generated/prisma/client";
import {
  listActiveBankAccounts,
  linkSpeBankAccount,
  unlinkSpeBankAccount,
  setPrimarySpeBankAccount,
} from "@/server/bank-accounts";
import {
  createSpePartner,
  updateSpePartner,
  deleteSpePartner,
  createSpeInvestor,
  updateSpeInvestor,
  deleteSpeInvestor,
  type CreateSpePartnerInput,
  type CreateSpeInvestorInput,
} from "@/server/spe-people";

export type FormState = { error?: string; success?: boolean };

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

function parseSpePartnerInput(formData: FormData): CreateSpePartnerInput | { error: string } {
  const type = String(formData.get("type") ?? "") as SpeDocumentHolderType;
  const name = String(formData.get("name") ?? "").trim();
  const document = onlyDigits(String(formData.get("document") ?? ""));
  const participationPctRaw = String(formData.get("participationPct") ?? "").replace(",", ".");
  const role = String(formData.get("role") ?? "") as SpePartnerRole | "";
  const startDateRaw = String(formData.get("startDate") ?? "");
  const endDateRaw = String(formData.get("endDate") ?? "");

  if (!["INDIVIDUAL", "COMPANY"].includes(type)) return { error: "Informe o tipo (PF/PJ)." };
  if (!name) return { error: "Informe o nome ou razão social." };
  if (!document || !isValidDocument(document, type)) {
    return { error: type === "COMPANY" ? "CNPJ inválido." : "CPF inválido." };
  }
  const participationPct = Number(participationPctRaw);
  if (!participationPctRaw || Number.isNaN(participationPct) || participationPct <= 0 || participationPct > 100) {
    return { error: "Percentual de participação deve ser maior que 0 e no máximo 100." };
  }

  return {
    type,
    name,
    document,
    participationPct,
    role: role || undefined,
    startDate: startDateRaw ? new Date(startDateRaw) : undefined,
    endDate: endDateRaw ? new Date(endDateRaw) : undefined,
  };
}

export async function createSpePartnerAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  const speId = String(formData.get("speId") ?? "");
  if (!speId) return { error: "SPE inválida." };

  const input = parseSpePartnerInput(formData);
  if ("error" in input) return input;

  try {
    await createSpePartner(context, speId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao adicionar sócio." };
  }
  revalidatePath("/spes");
  return { success: true };
}

export async function updateSpePartnerAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  const speId = String(formData.get("speId") ?? "");
  const partnerId = String(formData.get("partnerId") ?? "");
  if (!speId || !partnerId) return { error: "Sócio inválido." };

  const input = parseSpePartnerInput(formData);
  if ("error" in input) return input;

  try {
    await updateSpePartner(context, speId, partnerId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar sócio." };
  }
  revalidatePath("/spes");
  return { success: true };
}

export async function deleteSpePartnerAction(
  speId: string,
  partnerId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  try {
    await deleteSpePartner(context, speId, partnerId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao remover sócio." };
  }
  revalidatePath("/spes");
  return { success: true };
}

function parseSpeInvestorInput(formData: FormData): CreateSpeInvestorInput | { error: string } {
  const type = String(formData.get("type") ?? "") as SpeDocumentHolderType;
  const name = String(formData.get("name") ?? "").trim();
  const document = onlyDigits(String(formData.get("document") ?? ""));
  const email = String(formData.get("email") ?? "").trim();
  const phone = onlyDigits(String(formData.get("phone") ?? ""));
  const modality = String(formData.get("modality") ?? "") as SpeInvestorModality;
  const contributedCapitalRaw = String(formData.get("contributedCapital") ?? "").replace(",", ".");
  const resultParticipationPctRaw = String(formData.get("resultParticipationPct") ?? "").replace(",", ".");
  const contributionDateRaw = String(formData.get("contributionDate") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!["INDIVIDUAL", "COMPANY"].includes(type)) return { error: "Informe o tipo (PF/PJ)." };
  if (!name) return { error: "Informe o nome ou razão social." };
  if (!document || !isValidDocument(document, type)) {
    return { error: type === "COMPANY" ? "CNPJ inválido." : "CPF inválido." };
  }
  if (!email || !isValidEmail(email)) return { error: "Informe um e-mail válido." };
  if (!phone || !isValidBrazilianPhone(phone)) return { error: "Informe um telefone válido, com DDD." };
  if (!["EQUITY", "LOAN", "PHYSICAL_EXCHANGE", "FINANCIAL_EXCHANGE", "OTHER"].includes(modality)) {
    return { error: "Informe a modalidade." };
  }

  const contributedCapital = contributedCapitalRaw ? Number(contributedCapitalRaw) : undefined;
  if (contributedCapital !== undefined && (Number.isNaN(contributedCapital) || contributedCapital < 0)) {
    return { error: "Capital aportado inválido." };
  }
  const resultParticipationPct = resultParticipationPctRaw ? Number(resultParticipationPctRaw) : undefined;
  if (
    resultParticipationPct !== undefined &&
    (Number.isNaN(resultParticipationPct) || resultParticipationPct < 0 || resultParticipationPct > 100)
  ) {
    return { error: "Percentual de participação no resultado inválido." };
  }

  return {
    type,
    name,
    document,
    email,
    phone,
    modality,
    contributedCapital,
    resultParticipationPct,
    contributionDate: contributionDateRaw ? new Date(contributionDateRaw) : undefined,
    notes: notes || undefined,
  };
}

export async function createSpeInvestorAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  const speId = String(formData.get("speId") ?? "");
  if (!speId) return { error: "SPE inválida." };

  const input = parseSpeInvestorInput(formData);
  if ("error" in input) return input;

  try {
    await createSpeInvestor(context, speId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao adicionar investidor." };
  }
  revalidatePath("/spes");
  return { success: true };
}

export async function updateSpeInvestorAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  const speId = String(formData.get("speId") ?? "");
  const investorId = String(formData.get("investorId") ?? "");
  if (!speId || !investorId) return { error: "Investidor inválido." };

  const input = parseSpeInvestorInput(formData);
  if ("error" in input) return input;

  try {
    await updateSpeInvestor(context, speId, investorId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar investidor." };
  }
  revalidatePath("/spes");
  return { success: true };
}

export async function deleteSpeInvestorAction(
  speId: string,
  investorId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  try {
    await deleteSpeInvestor(context, speId, investorId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao remover investidor." };
  }
  revalidatePath("/spes");
  return { success: true };
}
