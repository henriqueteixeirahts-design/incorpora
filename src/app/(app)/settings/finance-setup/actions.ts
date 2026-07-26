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
import {
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  type CreateBankAccountInput,
} from "@/server/bank-accounts";
import type { BankAccountType, BankAccountStatus } from "@/generated/prisma/client";

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

function parseBankAccountInput(formData: FormData): CreateBankAccountInput | { error: string } {
  const bankCode = String(formData.get("bankCode") ?? "").trim();
  const bankName = String(formData.get("bankName") ?? "").trim();
  const agency = String(formData.get("agency") ?? "").trim();
  const account = String(formData.get("account") ?? "").trim();
  const type = String(formData.get("type") ?? "") as BankAccountType;
  const pixKeyType = String(formData.get("pixKeyType") ?? "").trim();
  const pixKeyValue = String(formData.get("pixKeyValue") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim();
  const status = String(formData.get("status") ?? "ACTIVE") as BankAccountStatus;

  if (!bankName) return { error: "Informe o banco." };
  if (!agency) return { error: "Informe a agência." };
  if (!account) return { error: "Informe a conta." };
  if (!["CHECKING", "SAVINGS", "PAYMENT"].includes(type)) return { error: "Informe o tipo de conta." };

  return {
    bankCode: bankCode || undefined,
    bankName,
    agency,
    account,
    type,
    pixKeyType: pixKeyType || undefined,
    pixKeyValue: pixKeyValue || undefined,
    nickname: nickname || undefined,
    status,
  };
}

export async function createBankAccountAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "bank_account", "CREATE")) return { error: "Sem permissão." };

  const input = parseBankAccountInput(formData);
  if ("error" in input) return input;

  try {
    await createBankAccount(context, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar conta bancária." };
  }
  revalidatePath("/settings/finance-setup");
  return { success: true };
}

export async function updateBankAccountAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "bank_account", "EDIT")) return { error: "Sem permissão." };

  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  if (!bankAccountId) return { error: "Conta bancária inválida." };

  const input = parseBankAccountInput(formData);
  if ("error" in input) return input;

  try {
    await updateBankAccount(context, bankAccountId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar conta bancária." };
  }
  revalidatePath("/settings/finance-setup");
  return { success: true };
}

export async function deleteBankAccountAction(
  bankAccountId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "bank_account", "DELETE")) return { error: "Sem permissão." };

  try {
    await deleteBankAccount(context, bankAccountId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao excluir conta bancária." };
  }
  revalidatePath("/settings/finance-setup");
  return { success: true };
}
