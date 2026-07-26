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

export type FormState = { error?: string; success?: boolean };

function parseAgencyInput(formData: FormData): CreateAgencyInput | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const document = String(formData.get("document") ?? "").trim();
  if (!name) return { error: "Informe o nome da imobiliária." };
  return { name, document: document || undefined };
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
  const document = String(formData.get("document") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const agencyId = String(formData.get("agencyId") ?? "").trim();

  if (!name) return { error: "Informe o nome do corretor." };

  return {
    name,
    document: document || undefined,
    email: email || undefined,
    phone: phone || undefined,
    agencyId: agencyId || undefined,
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
