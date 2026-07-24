"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { createSalesTable, setSalesTableUnitPrice } from "@/server/sales-tables";

export type FormState = { error?: string };

export async function createSalesTableAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "sales_table", "CREATE")) return { error: "Sem permissão." };

  const developmentId = String(formData.get("developmentId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Informe o nome da tabela." };

  const numberField = (key: string) => {
    const raw = formData.get(key);
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isNaN(value) ? undefined : value;
  };

  try {
    await createSalesTable(context, {
      developmentId,
      name,
      downPaymentPercent: numberField("downPaymentPercent"),
      monthlyInstallments: numberField("monthlyInstallments"),
      keysInstallmentPercent: numberField("keysInstallmentPercent"),
      maxDiscountPercent: numberField("maxDiscountPercent"),
      commissionPercent: numberField("commissionPercent"),
      indexCode: String(formData.get("indexCode") ?? "").trim() || undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar tabela." };
  }

  revalidatePath(`/developments/${developmentId}/sales-tables`);
  return {};
}

export async function setUnitPriceAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "sales_table", "EDIT")) return { error: "Sem permissão." };

  const developmentId = String(formData.get("developmentId") ?? "");
  const salesTableId = String(formData.get("salesTableId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  const price = Number(formData.get("price"));
  const pricePerSqmRaw = formData.get("pricePerSqm");
  const pricePerSqm = pricePerSqmRaw ? Number(pricePerSqmRaw) : undefined;

  if (!unitId || Number.isNaN(price)) return { error: "Selecione a unidade e informe o preço." };

  try {
    await setSalesTableUnitPrice(context, salesTableId, unitId, price, pricePerSqm);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao definir preço." };
  }

  revalidatePath(`/developments/${developmentId}/sales-tables/${salesTableId}`);
  return {};
}
