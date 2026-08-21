"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  createAgency,
  updateAgency,
  deleteAgency,
  createBroker,
  updateBroker,
  deleteBroker,
  type CreateAgencyInput,
  type CreateBrokerInput,
} from "@/server/crm";
import { listSplitTiers, upsertSplitTiers, type SplitTierInput } from "@/server/agency-split-tiers";
import {
  getOrCreateDraftPartnershipAgreement,
  signPartnershipAgreement,
  revokePartnershipAgreement,
} from "@/server/partnership-agreements";
import type { BrokerRole, CustomerType, SplitTierKind } from "@/generated/prisma/client";

export type FormState = { error?: string; success?: boolean };

function parseAgencyInput(formData: FormData): CreateAgencyInput | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Informe o nome da imobiliária." };

  return {
    name,
    document: String(formData.get("document") ?? "").trim() || undefined,
    zipCode: String(formData.get("zipCode") ?? "").trim() || undefined,
    street: String(formData.get("street") ?? "").trim() || undefined,
    number: String(formData.get("number") ?? "").trim() || undefined,
    complement: String(formData.get("complement") ?? "").trim() || undefined,
    neighborhood: String(formData.get("neighborhood") ?? "").trim() || undefined,
    city: String(formData.get("city") ?? "").trim() || undefined,
    state: String(formData.get("state") ?? "").trim() || undefined,
    regionalManagerBrokerId: String(formData.get("regionalManagerBrokerId") ?? "").trim() || undefined,
    productManagerBrokerId: String(formData.get("productManagerBrokerId") ?? "").trim() || undefined,
  };
}

export async function createAgencyAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "agency", "CREATE")) return { error: "Sem permissão." };

  const input = parseAgencyInput(formData);
  if ("error" in input) return input;

  try {
    await createAgency(context, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar imobiliária." };
  }
  revalidatePath("/partners");
  return { success: true };
}

export async function updateAgencyAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "agency", "EDIT")) return { error: "Sem permissão." };

  const agencyId = String(formData.get("agencyId") ?? "");
  if (!agencyId) return { error: "Imobiliária inválida." };

  const input = parseAgencyInput(formData);
  if ("error" in input) return input;

  try {
    await updateAgency(context, agencyId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar imobiliária." };
  }
  revalidatePath("/partners");
  return { success: true };
}

export async function deleteAgencyAction(
  agencyId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "agency", "DELETE")) return { error: "Sem permissão." };

  try {
    await deleteAgency(context, agencyId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao excluir imobiliária." };
  }
  revalidatePath("/partners");
  return { success: true };
}

function parseBrokerInput(formData: FormData): CreateBrokerInput | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Informe o nome do corretor." };

  const role = String(formData.get("role") ?? "BROKER").trim() as BrokerRole;
  const billingTypeRaw = String(formData.get("billingType") ?? "").trim();
  const billingType = (billingTypeRaw === "INDIVIDUAL" || billingTypeRaw === "COMPANY" ? billingTypeRaw : undefined) as
    | CustomerType
    | undefined;

  return {
    name,
    document: String(formData.get("document") ?? "").trim() || undefined,
    creci: String(formData.get("creci") ?? "").trim() || undefined,
    email: String(formData.get("email") ?? "").trim() || undefined,
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    agencyId: String(formData.get("agencyId") ?? "").trim() || undefined,
    managerId: String(formData.get("managerId") ?? "").trim() || undefined,
    role: role === "MANAGER" ? "MANAGER" : "BROKER",
    zipCode: String(formData.get("zipCode") ?? "").trim() || undefined,
    street: String(formData.get("street") ?? "").trim() || undefined,
    number: String(formData.get("number") ?? "").trim() || undefined,
    complement: String(formData.get("complement") ?? "").trim() || undefined,
    neighborhood: String(formData.get("neighborhood") ?? "").trim() || undefined,
    city: String(formData.get("city") ?? "").trim() || undefined,
    state: String(formData.get("state") ?? "").trim() || undefined,
    billingType,
    billingDocument: String(formData.get("billingDocument") ?? "").trim() || undefined,
    billingName: String(formData.get("billingName") ?? "").trim() || undefined,
    billingBankName: String(formData.get("billingBankName") ?? "").trim() || undefined,
    billingBankAgency: String(formData.get("billingBankAgency") ?? "").trim() || undefined,
    billingBankAccount: String(formData.get("billingBankAccount") ?? "").trim() || undefined,
    billingPixKey: String(formData.get("billingPixKey") ?? "").trim() || undefined,
  };
}

export async function createBrokerAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "broker", "CREATE")) return { error: "Sem permissão." };

  const input = parseBrokerInput(formData);
  if ("error" in input) return input;

  try {
    await createBroker(context, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar corretor." };
  }
  revalidatePath("/partners");
  return { success: true };
}

export async function updateBrokerAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "broker", "EDIT")) return { error: "Sem permissão." };

  const brokerId = String(formData.get("brokerId") ?? "");
  if (!brokerId) return { error: "Corretor inválido." };

  const input = parseBrokerInput(formData);
  if ("error" in input) return input;

  try {
    await updateBroker(context, brokerId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar corretor." };
  }
  revalidatePath("/partners");
  return { success: true };
}

export async function getSplitTiersAction(agencyId: string) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "agency", "VIEW")) return { error: "Sem permissão.", tiers: [] as SplitTierInput[] };

  const tiers = await listSplitTiers(agencyId);
  return {
    tiers: tiers.map((t) => ({
      label: t.label,
      percent: Number(t.percent),
      kind: t.kind,
      fixedBrokerId: t.fixedBrokerId,
    })),
  };
}

export type SplitTierFormState = { error?: string; success?: boolean };

export async function upsertSplitTiersAction(
  _prevState: SplitTierFormState,
  formData: FormData,
): Promise<SplitTierFormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "agency", "EDIT")) return { error: "Sem permissão." };

  const agencyId = String(formData.get("agencyId") ?? "");
  if (!agencyId) return { error: "Imobiliária inválida." };

  const labels = formData.getAll("tierLabel").map(String);
  const percents = formData.getAll("tierPercent").map(Number);
  const kinds = formData.getAll("tierKind").map(String) as SplitTierKind[];
  const fixedBrokerIds = formData.getAll("tierFixedBrokerId").map(String);

  const tiers: SplitTierInput[] = labels.map((label, i) => ({
    label,
    percent: percents[i],
    kind: kinds[i],
    fixedBrokerId: fixedBrokerIds[i] || null,
  }));

  try {
    await upsertSplitTiers(context, agencyId, tiers);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao salvar o split." };
  }
  revalidatePath("/partners");
  return { success: true };
}

export async function getPartnershipStatusAction(
  partnerType: "AGENCY" | "AUTONOMOUS_BROKER",
  id: string,
): Promise<{ error: string } | { status: "DRAFT" | "SIGNED"; agreementId: string; signedAt: Date | null }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, partnerType === "AGENCY" ? "agency" : "broker", "VIEW")) {
    return { error: "Sem permissão." };
  }

  try {
    const agreement = await getOrCreateDraftPartnershipAgreement(
      context,
      partnerType === "AGENCY" ? { partnerType, agencyId: id } : { partnerType, brokerId: id },
    );
    return { status: agreement.status, agreementId: agreement.id, signedAt: agreement.signedAt };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao buscar a parceria." };
  }
}

export async function signPartnershipAction(
  agreementId: string,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "agency", "EDIT") && !hasPermission(context, "broker", "EDIT")) {
    return { error: "Sem permissão." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione o arquivo assinado (PDF)." };

  try {
    await signPartnershipAgreement(context, agreementId, file);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao registrar a parceria assinada." };
  }
  revalidatePath("/partners");
  return { success: true };
}

export async function revokePartnershipAction(agreementId: string): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "agency", "EDIT") && !hasPermission(context, "broker", "EDIT")) {
    return { error: "Sem permissão." };
  }

  try {
    await revokePartnershipAgreement(context, agreementId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao reverter a parceria." };
  }
  revalidatePath("/partners");
  return { success: true };
}

export async function deleteBrokerAction(
  brokerId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "broker", "DELETE")) return { error: "Sem permissão." };

  try {
    await deleteBroker(context, brokerId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao excluir corretor." };
  }
  revalidatePath("/partners");
  return { success: true };
}
