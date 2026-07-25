"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { createContract, markAwaitingSignature, confirmSignature } from "@/server/contracts";
import { uploadContractDocument } from "@/server/storage";
import {
  setContractCorrectionRule,
  recalculatePortfolio,
  registerInstallmentPayment,
  simulateInstallmentAnticipation,
} from "@/server/receivables";
import type { InterestType } from "@/generated/prisma/client";

export type FormState = { error?: string };
export type AnticipationState = {
  error?: string;
  result?: Awaited<ReturnType<typeof simulateInstallmentAnticipation>>;
};

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
  const file = formData.get("signedDocument");
  if (!contractId) return { error: "Contrato inválido." };

  try {
    let signedDocumentPath: string | undefined;
    if (file instanceof File && file.size > 0) {
      signedDocumentPath = await uploadContractDocument(file, contractId);
    }
    await confirmSignature(context, contractId, signedDocumentPath);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao confirmar assinatura." };
  }

  revalidatePath(`/sales/${saleId}`);
  return {};
}

export async function setCorrectionRuleAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "contract", "EDIT")) return { error: "Sem permissão." };

  const saleId = String(formData.get("saleId") ?? "");
  const contractId = String(formData.get("contractId") ?? "");
  const indexRuleId = String(formData.get("indexRuleId") ?? "").trim() || null;
  const monthlyInterestPercentRaw = formData.get("monthlyInterestPercent");
  const monthlyInterestPercent = monthlyInterestPercentRaw
    ? Number(monthlyInterestPercentRaw)
    : null;
  const interestType = String(formData.get("interestType") ?? "COMPOUND") as InterestType;
  const latePaymentFinePercent = Number(formData.get("latePaymentFinePercent") ?? 2);
  const latePaymentMonthlyInterestPercent = Number(
    formData.get("latePaymentMonthlyInterestPercent") ?? 1,
  );

  if (!contractId) return { error: "Contrato inválido." };

  try {
    await setContractCorrectionRule(context, contractId, {
      indexRuleId,
      monthlyInterestPercent,
      interestType,
      latePaymentFinePercent,
      latePaymentMonthlyInterestPercent,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao configurar correção." };
  }

  revalidatePath(`/sales/${saleId}`);
  return {};
}

export async function recalculatePortfolioAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "installment", "EDIT")) return;

  const saleId = String(formData.get("saleId") ?? "");
  const portfolioId = String(formData.get("portfolioId") ?? "");
  if (!portfolioId) return;

  await recalculatePortfolio(context.organizationId, portfolioId);
  revalidatePath(`/sales/${saleId}`);
}

export async function registerPaymentAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "installment", "CREATE")) return { error: "Sem permissão." };

  const saleId = String(formData.get("saleId") ?? "");
  const installmentId = String(formData.get("installmentId") ?? "");
  const amount = Number(formData.get("amount"));
  const paidAtRaw = String(formData.get("paidAt") ?? "");
  const method = String(formData.get("method") ?? "").trim() || undefined;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  if (!installmentId || Number.isNaN(amount) || !paidAtRaw) {
    return { error: "Preencha parcela, valor e data do recebimento." };
  }

  try {
    await registerInstallmentPayment(context, installmentId, {
      amount,
      paidAt: new Date(paidAtRaw),
      method,
      notes,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao registrar recebimento." };
  }

  revalidatePath(`/sales/${saleId}`);
  return {};
}

export async function simulateAnticipationAction(
  _prevState: AnticipationState,
  formData: FormData,
): Promise<AnticipationState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "installment", "VIEW")) return { error: "Sem permissão." };

  const installmentIds = formData.getAll("installmentIds").map(String);
  const discountPercent = Number(formData.get("discountPercent") ?? 0);

  if (installmentIds.length === 0) return { error: "Selecione ao menos uma parcela." };

  try {
    const result = await simulateInstallmentAnticipation(
      context.organizationId,
      installmentIds,
      discountPercent,
    );
    return { result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao simular antecipação." };
  }
}
