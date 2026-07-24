"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { createContract, markAwaitingSignature, confirmSignature } from "@/server/contracts";

export type FormState = { error?: string };

export async function createContractAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "contract", "CREATE")) return { error: "Sem permissão." };

  const saleId = String(formData.get("saleId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  if (!saleId) return { error: "Venda inválida." };

  try {
    await createContract(context, saleId, notes);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao gerar minuta." };
  }

  revalidatePath(`/sales/${saleId}`);
  return {};
}

export async function markAwaitingSignatureAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "contract", "EDIT")) return;

  const saleId = String(formData.get("saleId") ?? "");
  const contractId = String(formData.get("contractId") ?? "");
  if (!contractId) return;

  await markAwaitingSignature(context, contractId);
  revalidatePath(`/sales/${saleId}`);
}

export async function confirmSignatureAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "contract", "EDIT")) return { error: "Sem permissão." };

  const saleId = String(formData.get("saleId") ?? "");
  const contractId = String(formData.get("contractId") ?? "");
  const signedDocumentUrl = String(formData.get("signedDocumentUrl") ?? "").trim() || undefined;
  if (!contractId) return { error: "Contrato inválido." };

  try {
    await confirmSignature(context, contractId, signedDocumentUrl);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao confirmar assinatura." };
  }

  revalidatePath(`/sales/${saleId}`);
  return {};
}
