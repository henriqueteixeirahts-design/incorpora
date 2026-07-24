"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { createSupplier, createCostCenter } from "@/server/finance-setup";

export type FormState = { error?: string };

export async function createSupplierAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "supplier", "CREATE")) return { error: "Sem permissão." };

  const name = String(formData.get("name") ?? "").trim();
  const document = String(formData.get("document") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name) return { error: "Informe o nome do fornecedor." };

  try {
    await createSupplier(context, {
      name,
      document: document || undefined,
      email: email || undefined,
      phone: phone || undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar fornecedor." };
  }

  revalidatePath("/finance-setup");
  return {};
}

export async function createCostCenterAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "cost_center", "CREATE")) return { error: "Sem permissão." };

  const name = String(formData.get("name") ?? "").trim();
  const developmentId = String(formData.get("developmentId") ?? "").trim() || undefined;
  if (!name) return { error: "Informe o nome do centro de custo." };

  try {
    await createCostCenter(context, { name, developmentId });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar centro de custo." };
  }

  revalidatePath("/finance-setup");
  return {};
}
