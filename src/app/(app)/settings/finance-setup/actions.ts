"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  createSupplier,
  updateSupplier,
  deleteSupplier,
  createCostCenter,
  updateCostCenter,
  deleteCostCenter,
  type CreateSupplierInput,
  type CreateCostCenterInput,
} from "@/server/finance-setup";

export type FormState = { error?: string; success?: boolean };

function parseSupplierInput(formData: FormData): CreateSupplierInput | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const document = String(formData.get("document") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name) return { error: "Informe o nome do fornecedor." };
  return {
    name,
    document: document || undefined,
    email: email || undefined,
    phone: phone || undefined,
  };
}

export async function createSupplierAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "supplier", "CREATE")) return { error: "Sem permissão." };

  const input = parseSupplierInput(formData);
  if ("error" in input) return input;

  try {
    await createSupplier(context, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar fornecedor." };
  }
  revalidatePath("/settings/finance-setup");
  return { success: true };
}

export async function updateSupplierAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "supplier", "EDIT")) return { error: "Sem permissão." };

  const supplierId = String(formData.get("supplierId") ?? "");
  if (!supplierId) return { error: "Fornecedor inválido." };

  const input = parseSupplierInput(formData);
  if ("error" in input) return input;

  try {
    await updateSupplier(context, supplierId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar fornecedor." };
  }
  revalidatePath("/settings/finance-setup");
  return { success: true };
}

export async function deleteSupplierAction(
  supplierId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "supplier", "DELETE")) return { error: "Sem permissão." };

  try {
    await deleteSupplier(context, supplierId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao excluir fornecedor." };
  }
  revalidatePath("/settings/finance-setup");
  return { success: true };
}

function parseCostCenterInput(formData: FormData): CreateCostCenterInput | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const developmentId = String(formData.get("developmentId") ?? "").trim() || undefined;
  if (!name) return { error: "Informe o nome do centro de custo." };
  return { name, developmentId };
}

export async function createCostCenterAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "cost_center", "CREATE")) return { error: "Sem permissão." };

  const input = parseCostCenterInput(formData);
  if ("error" in input) return input;

  try {
    await createCostCenter(context, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar centro de custo." };
  }
  revalidatePath("/settings/finance-setup");
  return { success: true };
}

export async function updateCostCenterAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "cost_center", "EDIT")) return { error: "Sem permissão." };

  const costCenterId = String(formData.get("costCenterId") ?? "");
  if (!costCenterId) return { error: "Centro de custo inválido." };

  const input = parseCostCenterInput(formData);
  if ("error" in input) return input;

  try {
    await updateCostCenter(context, costCenterId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar centro de custo." };
  }
  revalidatePath("/settings/finance-setup");
  return { success: true };
}

export async function deleteCostCenterAction(
  costCenterId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "cost_center", "DELETE")) return { error: "Sem permissão." };

  try {
    await deleteCostCenter(context, costCenterId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao excluir centro de custo." };
  }
  revalidatePath("/settings/finance-setup");
  return { success: true };
}
