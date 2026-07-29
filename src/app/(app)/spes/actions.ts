"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  createSpe,
  updateSpe,
  deleteSpe,
  getSpeDetail,
  uploadSpeDocument,
  deleteSpeDocument,
  updateSpeAccounting,
  DuplicateSpeDocumentError,
  type CreateSpeInput,
  type UpdateSpeAccountingInput,
} from "@/server/spes";
import { onlyDigits, isValidCnpj, isValidEmail, isValidBrazilianPhone, isValidDocument } from "@/lib/br-validation";
import type {
  SpeStatus,
  SpeDocumentHolderType,
  SpePartnerRole,
  SpeInvestorModality,
  SpeInvestorLoanInterestPeriod,
  SpeContributionForecastOrigin,
  DocumentCategory,
  LandAcquisitionMethod,
  TaxRegime,
} from "@/generated/prisma/client";
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
import {
  createSpeLand,
  updateSpeLand,
  deleteSpeLand,
  type CreateSpeLandInput,
} from "@/server/spe-lands";
import { listIndexRules } from "@/server/index-rules";
import {
  getInvestorContributionsDetail,
  getSpeContributionSummary,
  createContributionForecast,
  updateContributionForecast,
  cancelContributionForecast,
  createContribution,
  deleteContribution,
  type CreateContributionForecastInput,
  type CreateContributionInput,
} from "@/server/spe-contributions";

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
  const committedCapitalRaw = String(formData.get("committedCapital") ?? "").replace(",", ".");
  const returnBankName = String(formData.get("returnBankName") ?? "").trim();
  const returnBankAgency = String(formData.get("returnBankAgency") ?? "").trim();
  const returnBankAccount = String(formData.get("returnBankAccount") ?? "").trim();
  const returnPixKeyType = String(formData.get("returnPixKeyType") ?? "").trim();
  const returnPixKeyValue = String(formData.get("returnPixKeyValue") ?? "").trim();
  const loanInterestRateRaw = String(formData.get("loanInterestRate") ?? "").replace(",", ".");
  const loanInterestPeriod = String(formData.get("loanInterestPeriod") ?? "") as SpeInvestorLoanInterestPeriod | "";
  const loanIndexRuleId = String(formData.get("loanIndexRuleId") ?? "").trim();
  const loanGraceMonthsRaw = String(formData.get("loanGraceMonths") ?? "");
  const loanTermMonthsRaw = String(formData.get("loanTermMonths") ?? "");

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
  const committedCapital = committedCapitalRaw ? Number(committedCapitalRaw) : undefined;
  if (committedCapital !== undefined && (Number.isNaN(committedCapital) || committedCapital < 0)) {
    return { error: "Capital comprometido inválido." };
  }
  const loanInterestRate = loanInterestRateRaw ? Number(loanInterestRateRaw) : undefined;
  if (loanInterestRate !== undefined && (Number.isNaN(loanInterestRate) || loanInterestRate < 0)) {
    return { error: "Taxa de juros do mútuo inválida." };
  }
  if (loanInterestPeriod && !["MONTHLY", "YEARLY"].includes(loanInterestPeriod)) {
    return { error: "Periodicidade da taxa de juros inválida." };
  }
  const loanGraceMonths = loanGraceMonthsRaw ? Number(loanGraceMonthsRaw) : undefined;
  if (loanGraceMonths !== undefined && (!Number.isInteger(loanGraceMonths) || loanGraceMonths < 0)) {
    return { error: "Carência do mútuo inválida." };
  }
  const loanTermMonths = loanTermMonthsRaw ? Number(loanTermMonthsRaw) : undefined;
  if (loanTermMonths !== undefined && (!Number.isInteger(loanTermMonths) || loanTermMonths <= 0)) {
    return { error: "Prazo do mútuo inválido." };
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
    committedCapital,
    returnBankName: returnBankName || undefined,
    returnBankAgency: returnBankAgency || undefined,
    returnBankAccount: returnBankAccount || undefined,
    returnPixKeyType: returnPixKeyType || undefined,
    returnPixKeyValue: returnPixKeyValue || undefined,
    loanInterestRate,
    loanInterestPeriod: loanInterestPeriod || undefined,
    loanIndexRuleId: loanIndexRuleId || undefined,
    loanGraceMonths,
    loanTermMonths,
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

export async function uploadSpeDocumentAction(
  speId: string,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "document", "CREATE")) return { error: "Sem permissão." };

  const file = formData.get("file");
  const category = String(formData.get("category") ?? "OTHER") as DocumentCategory;
  const description = String(formData.get("description") ?? "").trim();
  const expiresAtRaw = String(formData.get("expiresAt") ?? "");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };

  try {
    await uploadSpeDocument(
      context,
      speId,
      file,
      category,
      description || undefined,
      expiresAtRaw ? new Date(expiresAtRaw) : undefined,
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao enviar anexo." };
  }
  revalidatePath("/spes");
  return { success: true };
}

export async function deleteSpeDocumentAction(
  speId: string,
  documentId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "document", "DELETE")) return { error: "Sem permissão." };

  try {
    await deleteSpeDocument(context, speId, documentId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao remover anexo." };
  }
  revalidatePath("/spes");
  return { success: true };
}

function parseSpeLandInput(formData: FormData): CreateSpeLandInput | { error: string } {
  const registrationNumber = String(formData.get("registrationNumber") ?? "").trim();
  const registryOffice = String(formData.get("registryOffice") ?? "").trim();
  const zipCode = onlyDigits(String(formData.get("zipCode") ?? ""));
  const street = String(formData.get("street") ?? "").trim();
  const number = String(formData.get("number") ?? "").trim();
  const complement = String(formData.get("complement") ?? "").trim();
  const neighborhood = String(formData.get("neighborhood") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim().toUpperCase();
  const totalAreaRaw = String(formData.get("totalArea") ?? "").replace(",", ".");
  const municipalRegistration = String(formData.get("municipalRegistration") ?? "").trim();
  const acquisitionMethod = String(formData.get("acquisitionMethod") ?? "") as LandAcquisitionMethod | "";
  const previousOwner = String(formData.get("previousOwner") ?? "").trim();
  const acquisitionValueRaw = String(formData.get("acquisitionValue") ?? "").replace(",", ".");
  const acquisitionDateRaw = String(formData.get("acquisitionDate") ?? "");
  const affectationEstablished = formData.get("affectationEstablished") === "on";
  const affectationRegisteredAtRaw = String(formData.get("affectationRegisteredAt") ?? "");
  const encumbrances = String(formData.get("encumbrances") ?? "").trim();

  if (!registrationNumber) return { error: "Informe o número da matrícula." };
  if (!registryOffice) return { error: "Informe o cartório de registro." };
  if (!street || !city || !state || !zipCode) return { error: "Endereço completo é obrigatório." };

  const totalArea = Number(totalAreaRaw);
  if (!totalAreaRaw || Number.isNaN(totalArea) || totalArea <= 0) {
    return { error: "Informe a área total (m²)." };
  }

  const acquisitionValue = acquisitionValueRaw ? Number(acquisitionValueRaw) : undefined;
  if (acquisitionValue !== undefined && (Number.isNaN(acquisitionValue) || acquisitionValue < 0)) {
    return { error: "Valor de aquisição inválido." };
  }

  return {
    registrationNumber,
    registryOffice,
    zipCode: zipCode || undefined,
    street: street || undefined,
    number: number || undefined,
    complement: complement || undefined,
    neighborhood: neighborhood || undefined,
    city: city || undefined,
    state: state || undefined,
    totalArea,
    municipalRegistration: municipalRegistration || undefined,
    acquisitionMethod: acquisitionMethod || undefined,
    previousOwner: previousOwner || undefined,
    acquisitionValue,
    acquisitionDate: acquisitionDateRaw ? new Date(acquisitionDateRaw) : undefined,
    affectationEstablished,
    affectationRegisteredAt: affectationRegisteredAtRaw ? new Date(affectationRegisteredAtRaw) : undefined,
    encumbrances: encumbrances || undefined,
  };
}

export async function createSpeLandAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  const speId = String(formData.get("speId") ?? "");
  if (!speId) return { error: "SPE inválida." };

  const input = parseSpeLandInput(formData);
  if ("error" in input) return input;

  try {
    await createSpeLand(context, speId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao adicionar terreno." };
  }
  revalidatePath("/spes");
  return { success: true };
}

export async function updateSpeLandAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  const speId = String(formData.get("speId") ?? "");
  const landId = String(formData.get("landId") ?? "");
  if (!speId || !landId) return { error: "Terreno inválido." };

  const input = parseSpeLandInput(formData);
  if ("error" in input) return input;

  try {
    await updateSpeLand(context, speId, landId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar terreno." };
  }
  revalidatePath("/spes");
  return { success: true };
}

export async function deleteSpeLandAction(
  speId: string,
  landId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  try {
    await deleteSpeLand(context, speId, landId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao remover terreno." };
  }
  revalidatePath("/spes");
  return { success: true };
}

function parseSpeAccountingInput(formData: FormData): UpdateSpeAccountingInput | { error: string } {
  const taxRegime = String(formData.get("taxRegime") ?? "") as TaxRegime | "";
  const retOptionSinceRaw = String(formData.get("retOptionSince") ?? "");
  const event109Cnpj = onlyDigits(String(formData.get("event109Cnpj") ?? ""));
  const accountantName = String(formData.get("accountantName") ?? "").trim();
  const accountantCrc = String(formData.get("accountantCrc") ?? "").trim();
  const accountantEmail = String(formData.get("accountantEmail") ?? "").trim();
  const accountantPhone = onlyDigits(String(formData.get("accountantPhone") ?? ""));
  const accountingFirm = String(formData.get("accountingFirm") ?? "").trim();
  const externalAccountingCode = String(formData.get("externalAccountingCode") ?? "").trim();
  const chartOfAccountsRef = String(formData.get("chartOfAccountsRef") ?? "").trim();
  const dimobRequired = formData.get("dimobRequired") === "on";
  const efdContributionsRequired = formData.get("efdContributionsRequired") === "on";
  const accountingNotes = String(formData.get("accountingNotes") ?? "").trim();

  if (accountantEmail && !isValidEmail(accountantEmail)) {
    return { error: "E-mail do contador inválido." };
  }

  return {
    taxRegime: taxRegime || undefined,
    retOptionSince: retOptionSinceRaw ? new Date(retOptionSinceRaw) : undefined,
    event109Cnpj: event109Cnpj || undefined,
    accountantName: accountantName || undefined,
    accountantCrc: accountantCrc || undefined,
    accountantEmail: accountantEmail || undefined,
    accountantPhone: accountantPhone || undefined,
    accountingFirm: accountingFirm || undefined,
    externalAccountingCode: externalAccountingCode || undefined,
    chartOfAccountsRef: chartOfAccountsRef || undefined,
    dimobRequired,
    efdContributionsRequired,
    accountingNotes: accountingNotes || undefined,
  };
}

export async function updateSpeAccountingAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  const speId = String(formData.get("speId") ?? "");
  if (!speId) return { error: "SPE inválida." };

  const input = parseSpeAccountingInput(formData);
  if ("error" in input) return input;

  try {
    await updateSpeAccounting(context, speId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar dados contábeis." };
  }
  revalidatePath("/spes");
  return { success: true };
}

export async function getIndexRulesAction() {
  const context = await requireAccessContext();
  if (!hasPermission(context, "index_rule", "VIEW")) return [];
  return listIndexRules(context.organizationId);
}

export async function getInvestorContributionsDetailAction(investorId: string) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "VIEW")) return null;
  try {
    return await getInvestorContributionsDetail(context, investorId);
  } catch {
    return null;
  }
}

export async function getSpeContributionSummaryAction(speId: string) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "VIEW")) return null;
  try {
    return await getSpeContributionSummary(context, speId);
  } catch {
    return null;
  }
}

function parseContributionForecastInput(formData: FormData): CreateContributionForecastInput | { error: string } {
  const amountRaw = String(formData.get("amount") ?? "").replace(",", ".");
  const expectedDateRaw = String(formData.get("expectedDate") ?? "");
  const origin = String(formData.get("origin") ?? "") as SpeContributionForecastOrigin;
  const notes = String(formData.get("notes") ?? "").trim();

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) return { error: "Informe um valor previsto válido." };
  if (!expectedDateRaw) return { error: "Informe a data prevista." };
  if (!["CASH_FLOW_PLANNING", "PUNCTUAL_AGREEMENT", "CAPITAL_CALL"].includes(origin)) {
    return { error: "Informe a origem da previsão." };
  }

  return { amount, expectedDate: new Date(expectedDateRaw), origin, notes: notes || undefined };
}

export async function createContributionForecastAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  const investorId = String(formData.get("investorId") ?? "");
  if (!investorId) return { error: "Investidor inválido." };

  const input = parseContributionForecastInput(formData);
  if ("error" in input) return input;

  try {
    await createContributionForecast(context, investorId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao lançar previsão." };
  }
  revalidatePath("/spes");
  return { success: true };
}

export async function updateContributionForecastAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  const investorId = String(formData.get("investorId") ?? "");
  const forecastId = String(formData.get("forecastId") ?? "");
  if (!investorId || !forecastId) return { error: "Previsão inválida." };

  const input = parseContributionForecastInput(formData);
  if ("error" in input) return input;

  try {
    await updateContributionForecast(context, investorId, forecastId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar previsão." };
  }
  revalidatePath("/spes");
  return { success: true };
}

export async function cancelContributionForecastAction(
  investorId: string,
  forecastId: string,
  reason: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  try {
    await cancelContributionForecast(context, investorId, forecastId, reason);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao cancelar previsão." };
  }
  revalidatePath("/spes");
  return { success: true };
}

function parseContributionInput(formData: FormData): CreateContributionInput | { error: string } {
  const forecastId = String(formData.get("forecastId") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").replace(",", ".");
  const creditDateRaw = String(formData.get("creditDate") ?? "");
  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();
  const method = String(formData.get("method") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const receiptFile = formData.get("receiptFile");

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) return { error: "Informe um valor de aporte válido." };
  if (!creditDateRaw) return { error: "Informe a data do crédito." };
  if (!bankAccountId) return { error: "Informe a conta bancária que recebeu o aporte." };

  return {
    forecastId: forecastId || undefined,
    amount,
    creditDate: new Date(creditDateRaw),
    bankAccountId,
    method: method || undefined,
    notes: notes || undefined,
    receiptFile: receiptFile instanceof File && receiptFile.size > 0 ? receiptFile : undefined,
  };
}

export async function createContributionAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  const investorId = String(formData.get("investorId") ?? "");
  if (!investorId) return { error: "Investidor inválido." };

  const input = parseContributionInput(formData);
  if ("error" in input) return input;

  try {
    await createContribution(context, investorId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao registrar aporte." };
  }
  revalidatePath("/spes");
  return { success: true };
}

export async function deleteContributionAction(
  investorId: string,
  contributionId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) return { error: "Sem permissão." };

  try {
    await deleteContribution(context, investorId, contributionId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao remover aporte." };
  }
  revalidatePath("/spes");
  return { success: true };
}
