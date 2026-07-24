"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { createCustomer } from "@/server/crm";
import type { CustomerType } from "@/generated/prisma/client";

export type FormState = { error?: string };

export async function createCustomerAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "customer", "CREATE")) return { error: "Sem permissão." };

  const type = String(formData.get("type") ?? "INDIVIDUAL") as CustomerType;
  const name = String(formData.get("name") ?? "").trim();
  const document = String(formData.get("document") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!name || !document) return { error: "Nome e documento são obrigatórios." };

  try {
    await createCustomer(context, {
      type,
      name,
      document,
      email: email || undefined,
      phone: phone || undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar cliente." };
  }

  revalidatePath("/customers");
  return {};
}
