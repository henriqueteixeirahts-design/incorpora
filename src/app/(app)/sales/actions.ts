"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { addCommissionSplit, getSale, setSaleDownPaymentDestinationOverride } from "@/server/sales";
import type { CommissionBeneficiaryType, DownPaymentDestination } from "@/generated/prisma/client";

export type FormState = { error?: string; success?: boolean };

export async function addCommissionSplitAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "sale", "EDIT")) return { error: "Sem permissão." };

  const saleId = String(formData.get("saleId") ?? "");
  const beneficiaryType = String(formData.get("beneficiaryType") ?? "") as CommissionBeneficiaryType;
  const brokerId = String(formData.get("brokerId") ?? "").trim() || undefined;
  const agencyId = String(formData.get("agencyId") ?? "").trim() || undefined;
  const label = String(formData.get("label") ?? "").trim() || undefined;
  const percent = Number(formData.get("percent"));

  if (!saleId || !beneficiaryType || Number.isNaN(percent)) {
    return { error: "Preencha tipo de beneficiário e percentual." };
  }

  try {
    await addCommissionSplit(context, saleId, { beneficiaryType, brokerId, agencyId, label, percent });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao lançar comissão." };
  }

  revalidatePath("/sales");
  return { success: true };
}

export async function getSaleCommissionSplitsAction(saleId: string) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "sale", "VIEW")) return null;
  const sale = await getSale(context.organizationId, saleId);
  return sale?.commissionSplits ?? null;
}

export async function setDownPaymentDestinationOverrideAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "sale", "EDIT")) return { error: "Sem permissão." };

  const saleId = String(formData.get("saleId") ?? "");
  const raw = String(formData.get("destination") ?? "");
  if (!saleId) return { error: "Venda inválida." };

  const destination = raw ? (raw as DownPaymentDestination) : null;

  try {
    await setSaleDownPaymentDestinationOverride(context, saleId, destination);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao definir destino da entrada." };
  }

  revalidatePath("/sales");
  return { success: true };
}
