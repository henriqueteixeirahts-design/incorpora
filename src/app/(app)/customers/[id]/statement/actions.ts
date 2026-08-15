"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { registerInstallmentPayment, simulateFullSettlement } from "@/server/receivables";
import { getCustomerFinancialPosition } from "@/server/customer-statement";
import { previewDocumentGeneration, recordGeneratedDocument } from "@/server/document-generation";
import { uploadEntityDocument } from "@/server/storage";
import { renderStatementPdf, renderDocumentPdf, type StatementInstallmentRow } from "@/lib/document-pdf";
import { logCollectionContact } from "@/server/collection-log";
import { createRenegotiationAgreement, decideRenegotiationApproval, signRenegotiationAgreement } from "@/server/renegotiations";
import type { ApprovalLevel } from "@/generated/prisma/client";

export type FormState = { error?: string };
export type SettlementState = {
  error?: string;
  result?: Awaited<ReturnType<typeof simulateFullSettlement>>;
};
export type GenerateStatementState = { error?: string; missing?: string[]; missingTemplateName?: string; success?: boolean };
export type LogContactState = { error?: string; success?: boolean };
export type RenegotiationFormState = { error?: string; success?: boolean };

/** input[type=date] devolve "AAAA-MM-DD" sem hora — ver nota em sales/[id]/actions.ts. */
function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function registerStatementPaymentAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "installment", "CREATE")) return { error: "Sem permissão." };

  const customerId = String(formData.get("customerId") ?? "");
  const installmentId = String(formData.get("installmentId") ?? "");
  const amount = Number(formData.get("amount"));
  const paidAtRaw = String(formData.get("paidAt") ?? "");
  const method = String(formData.get("method") ?? "").trim() || undefined;

  if (!installmentId || Number.isNaN(amount) || !paidAtRaw) {
    return { error: "Preencha parcela, valor e data do recebimento." };
  }

  try {
    await registerInstallmentPayment(context, installmentId, { amount, paidAt: parseDateOnly(paidAtRaw), method });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao registrar recebimento." };
  }

  revalidatePath(`/customers/${customerId}/statement`);
  return {};
}

export async function simulateFullSettlementAction(
  _prevState: SettlementState,
  formData: FormData,
): Promise<SettlementState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "installment", "VIEW")) return { error: "Sem permissão." };

  const contractId = String(formData.get("contractId") ?? "");
  const targetDateRaw = String(formData.get("targetDate") ?? "");
  if (!contractId || !targetDateRaw) return { error: "Informe a data de quitação." };

  try {
    const result = await simulateFullSettlement(context.organizationId, contractId, parseDateOnly(targetDateRaw));
    return { result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao simular quitação." };
  }
}

export async function generateStatementPdfAction(
  _prevState: GenerateStatementState,
  formData: FormData,
): Promise<GenerateStatementState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "document_template", "VIEW")) return { error: "Sem permissão." };
  if (!hasPermission(context, "document", "CREATE")) return { error: "Sem permissão." };

  const customerId = String(formData.get("customerId") ?? "");
  const contractId = String(formData.get("contractId") ?? "");
  const documentTemplateId = String(formData.get("documentTemplateId") ?? "");
  if (!customerId || !contractId || !documentTemplateId) return { error: "Selecione um modelo." };

  try {
    const position = await getCustomerFinancialPosition(context.organizationId, customerId);
    if (!position) return { error: "Cliente inválido." };
    const contractStatement = position.contracts.find((c) => c.contractId === contractId);
    if (!contractStatement) return { error: "Contrato inválido." };

    const preview = await previewDocumentGeneration(
      context.organizationId,
      contractId,
      documentTemplateId,
      undefined,
      undefined,
      undefined,
      {
        asOfDateLabel: position.asOfDate.toLocaleDateString("pt-BR"),
        situationLabel: contractStatement.situationLabel,
        contractedValueLabel: formatCurrency(contractStatement.contractedValue),
        totalPaidLabel: formatCurrency(contractStatement.totalPaid),
        outstandingBalanceLabel: formatCurrency(contractStatement.outstandingBalance),
        percentPaidLabel: `${contractStatement.percentPaid}%`,
      },
    );
    if (preview.status === "MISSING_DATA") {
      return { missing: preview.missing, missingTemplateName: preview.templateName };
    }
    const headerText = preview.text;
    const templateName = preview.templateName;
    const templateVersion = preview.templateVersion;
    const resolvedTemplateId = preview.documentTemplateId;

    const installmentRows: StatementInstallmentRow[] = contractStatement.installments.map((i) => ({
      label: i.label,
      dueDateLabel: new Date(i.dueDate).toLocaleDateString("pt-BR"),
      originalValueLabel: formatCurrency(i.originalValue),
      correctedValueLabel: formatCurrency(i.resultValue),
      situationLabel: i.situationLabel,
      paymentLabel:
        i.payments.length > 0
          ? i.payments.map((p) => `${new Date(p.paidAt).toLocaleDateString("pt-BR")} — ${formatCurrency(p.amount)}${p.method ? ` — ${p.method}` : ""}`).join("; ")
          : "—",
    }));

    const pdfBuffer = await renderStatementPdf({
      title: `Extrato — ${contractStatement.contractNumber}`,
      headerText,
      footer: `Extrato — ${templateName}${templateVersion ? ` v${templateVersion}` : ""} — gerado em ${new Date().toLocaleString("pt-BR")}`,
      contracts: [
        {
          contractNumber: contractStatement.contractNumber,
          developmentUnit: `${contractStatement.developmentName} — ${contractStatement.unitNumber}`,
          situationLabel: contractStatement.situationLabel,
          contractedValueLabel: formatCurrency(contractStatement.contractedValue),
          totalPaidLabel: formatCurrency(contractStatement.totalPaid),
          outstandingBalanceLabel: formatCurrency(contractStatement.outstandingBalance),
          percentPaidLabel: `${contractStatement.percentPaid}%`,
          installments: installmentRows,
        },
      ],
    });

    const fileName = `extrato-${contractStatement.contractNumber.replace(/[^a-zA-Z0-9]+/g, "-")}-${Date.now()}.pdf`;
    const file = new File([new Uint8Array(pdfBuffer)], fileName, { type: "application/pdf" });
    const storagePath = await uploadEntityDocument(file, "Contract", contractId);

    await recordGeneratedDocument(context, {
      contractId,
      documentTemplateId: resolvedTemplateId,
      templateVersion,
      fileName,
      storagePath,
      sizeBytes: pdfBuffer.length,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao gerar o extrato." };
  }

  revalidatePath(`/customers/${customerId}/statement`);
  return { success: true };
}

export async function logCollectionContactAction(
  _prevState: LogContactState,
  formData: FormData,
): Promise<LogContactState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "installment", "CREATE")) return { error: "Sem permissão." };

  const customerId = String(formData.get("customerId") ?? "");
  const occurredAtRaw = String(formData.get("occurredAt") ?? "");
  const channel = String(formData.get("channel") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const nextStepNote = String(formData.get("nextStepNote") ?? "").trim() || undefined;

  if (!customerId || !occurredAtRaw || !channel || !summary) {
    return { error: "Preencha data, canal e resumo do contato." };
  }

  try {
    await logCollectionContact(context, customerId, {
      occurredAt: parseDateOnly(occurredAtRaw),
      channel,
      summary,
      nextStepNote,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao registrar o contato." };
  }

  revalidatePath(`/customers/${customerId}/statement`);
  return { success: true };
}

export async function createRenegotiationAction(
  _prevState: RenegotiationFormState,
  formData: FormData,
): Promise<RenegotiationFormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "contract", "EDIT")) return { error: "Sem permissão." };

  const customerId = String(formData.get("customerId") ?? "");
  const contractId = String(formData.get("contractId") ?? "");
  const installmentIds = formData.getAll("installmentIds").map(String);
  const agreementDateRaw = String(formData.get("agreementDate") ?? "");
  const chargesDiscountPercent = Number(formData.get("chargesDiscountPercent") ?? 0);
  const downPaymentRaw = formData.get("downPayment");
  const monthlyInstallments = Number(formData.get("monthlyInstallments") ?? 0);
  const applyFutureCorrection = formData.get("applyFutureCorrection") === "on";
  const reason = String(formData.get("reason") ?? "").trim() || undefined;

  if (!contractId || installmentIds.length === 0 || !agreementDateRaw) {
    return { error: "Selecione ao menos uma parcela e a data do acordo." };
  }

  try {
    await createRenegotiationAgreement(context, contractId, {
      installmentIds,
      agreementDate: parseDateOnly(agreementDateRaw),
      chargesDiscountPercent,
      downPayment: downPaymentRaw ? Number(downPaymentRaw) : undefined,
      monthlyInstallments,
      applyFutureCorrection,
      reason,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar o acordo." };
  }

  revalidatePath(`/customers/${customerId}/statement`);
  return { success: true };
}

export async function decideRenegotiationApprovalAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "contract", "EDIT")) return;

  const customerId = String(formData.get("customerId") ?? "");
  const agreementId = String(formData.get("agreementId") ?? "");
  const level = String(formData.get("level") ?? "") as ApprovalLevel;
  const decision = String(formData.get("decision") ?? "") as "APPROVED" | "REJECTED";
  const comment = String(formData.get("comment") ?? "").trim() || undefined;
  if (!agreementId || !level || (decision !== "APPROVED" && decision !== "REJECTED")) return;

  await decideRenegotiationApproval(context, agreementId, level, decision, comment);
  revalidatePath(`/customers/${customerId}/statement`);
}

export async function signRenegotiationAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "contract", "EDIT")) return;

  const customerId = String(formData.get("customerId") ?? "");
  const agreementId = String(formData.get("agreementId") ?? "");
  if (!agreementId) return;

  await signRenegotiationAgreement(context, agreementId);
  revalidatePath(`/customers/${customerId}/statement`);
}

export async function generateRenegotiationPdfAction(
  _prevState: GenerateStatementState,
  formData: FormData,
): Promise<GenerateStatementState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "document_template", "VIEW")) return { error: "Sem permissão." };
  if (!hasPermission(context, "document", "CREATE")) return { error: "Sem permissão." };

  const customerId = String(formData.get("customerId") ?? "");
  const contractId = String(formData.get("contractId") ?? "");
  const agreementId = String(formData.get("agreementId") ?? "");
  const documentTemplateId = String(formData.get("documentTemplateId") ?? "");
  if (!customerId || !contractId || !agreementId || !documentTemplateId) return { error: "Selecione um modelo." };

  try {
    const preview = await previewDocumentGeneration(
      context.organizationId,
      contractId,
      documentTemplateId,
      undefined,
      undefined,
      undefined,
      undefined,
      agreementId,
    );
    if (preview.status === "MISSING_DATA") {
      return { missing: preview.missing, missingTemplateName: preview.templateName };
    }

    const pdfBuffer = await renderDocumentPdf({
      title: preview.templateName,
      text: preview.text,
      footer: `${preview.templateName} — versão ${preview.templateVersion} — gerado em ${new Date().toLocaleString("pt-BR")}`,
    });

    const fileName = `${preview.templateName.replace(/[^a-zA-Z0-9]+/g, "-")}-v${preview.templateVersion}.pdf`;
    const file = new File([new Uint8Array(pdfBuffer)], fileName, { type: "application/pdf" });
    const storagePath = await uploadEntityDocument(file, "RenegotiationAgreement", agreementId);

    await recordGeneratedDocument(context, {
      contractId,
      documentTemplateId: preview.documentTemplateId,
      templateVersion: preview.templateVersion,
      fileName,
      storagePath,
      sizeBytes: pdfBuffer.length,
      renegotiationId: agreementId,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao gerar o documento." };
  }

  revalidatePath(`/customers/${customerId}/statement`);
  return { success: true };
}
