"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { createAgency, createBroker } from "@/server/crm";

export type FormState = { error?: string };

export async function createAgencyAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "agency", "CREATE")) return { error: "Sem permissão." };

  const name = String(formData.get("name") ?? "").trim();
  const document = String(formData.get("document") ?? "").trim();
  if (!name) return { error: "Informe o nome da imobiliária." };

  try {
    await createAgency(context, { name, document: document || undefined });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar imobiliária." };
  }

  revalidatePath("/partners");
  return {};
}

export async function createBrokerAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "broker", "CREATE")) return { error: "Sem permissão." };

  const name = String(formData.get("name") ?? "").trim();
  const document = String(formData.get("document") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const agencyId = String(formData.get("agencyId") ?? "").trim();

  if (!name) return { error: "Informe o nome do corretor." };

  try {
    await createBroker(context, {
      name,
      document: document || undefined,
      email: email || undefined,
      phone: phone || undefined,
      agencyId: agencyId || undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar corretor." };
  }

  revalidatePath("/partners");
  return {};
}
