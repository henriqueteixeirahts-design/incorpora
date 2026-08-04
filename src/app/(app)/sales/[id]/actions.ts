"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { createContract, markAwaitingSignature, confirmSignature } from "@/server/contracts";
import { uploadContractDocument, uploadEntityDocument } from "@/server/storage";
import {
  setContractCorrectionRule,
  recalculatePortfolio,
  registerInstallmentPayment,
  simulateInstallmentAnticipation,
} from "@/server/receivables";
import { previewDocumentGeneration, recordGeneratedDocument } from "@/server/document-generation";
import { renderDocumentPdf } from "@/lib/document-pdf";
import { createAmendment, signAmendment } from "@/server/contract-amendments";
import { createAssignment, signAssignment } from "@/server/contract-assignments";
import type { ContractAmendmentType, InterestType } from "@/generated/prisma/client";

export type FormState = { error?: string };
export type GenerateDocumentState = { error?: string; missing?: string[]; missingTemplateName?: string };
export type AmendmentFormState = { error?: string; success?: boolean };
export type AssignmentFormState = { error?: string; success?: boolean };

/** input[type=date] devolve "AAAA-MM-DD" sem hora — `new Date(str)` interpretaria
 * isso como meia-noite UTC, que exibe um dia a menos em `toLocaleDateString("pt-BR")`
 * pra qualquer servidor rodando num fuso a oeste de UTC. Constrói a data local
 * direto dos componentes pra evitar esse desvio de fuso. */
function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
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

export async function generateDocumentAction(
  _prevState: GenerateDocumentState,
  formData: FormData,
): Promise<GenerateDocumentState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "document_template", "VIEW")) return { error: "Sem permissão." };
  if (!hasPermission(context, "document", "CREATE")) return { error: "Sem permissão." };

  const saleId = String(formData.get("saleId") ?? "");
  const contractId = String(formData.get("contractId") ?? "");
  const documentTemplateId = String(formData.get("documentTemplateId") ?? "");
  const amendmentId = String(formData.get("amendmentId") ?? "").trim() || undefined;
  const assignmentId = String(formData.get("assignmentId") ?? "").trim() || undefined;
  if (!contractId || !documentTemplateId) return { error: "Selecione um modelo." };

  try {
    const preview = await previewDocumentGeneration(
      context.organizationId,
      contractId,
      documentTemplateId,
      amendmentId,
      assignmentId,
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
    const entityType = amendmentId ? "ContractAmendment" : assignmentId ? "ContractAssignment" : "Contract";
    const entityId = amendmentId ?? assignmentId ?? contractId;
    const storagePath = await uploadEntityDocument(file, entityType, entityId);

    await recordGeneratedDocument(context, {
      contractId,
      documentTemplateId: preview.documentTemplateId,
      templateVersion: preview.templateVersion,
      fileName,
      storagePath,
      sizeBytes: pdfBuffer.length,
      amendmentId,
      assignmentId,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao gerar documento." };
  }

  revalidatePath(`/sales/${saleId}`);
  return {};
}

export async function createAmendmentAction(
  _prevState: AmendmentFormState,
  formData: FormData,
): Promise<AmendmentFormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "contract", "EDIT")) return { error: "Sem permissão." };

  const saleId = String(formData.get("saleId") ?? "");
  const contractId = String(formData.get("contractId") ?? "");
  const type = String(formData.get("type") ?? "") as ContractAmendmentType;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const downPaymentPercentRaw = formData.get("downPaymentPercent");
  const monthlyInstallmentsRaw = formData.get("monthlyInstallments");
  const keysInstallmentPercentRaw = formData.get("keysInstallmentPercent");

  if (!contractId) return { error: "Contrato inválido." };
  if (!["FLOW_RENEGOTIATION", "UNIT_CHANGE", "TERM_CHANGE", "OTHER"].includes(type)) {
    return { error: "Tipo de aditivo inválido." };
  }

  try {
    await createAmendment(context, contractId, {
      type,
      notes,
      downPaymentPercent: downPaymentPercentRaw ? Number(downPaymentPercentRaw) : undefined,
      monthlyInstallments: monthlyInstallmentsRaw ? Number(monthlyInstallmentsRaw) : undefined,
      keysInstallmentPercent: keysInstallmentPercentRaw ? Number(keysInstallmentPercentRaw) : undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar aditivo." };
  }

  revalidatePath(`/sales/${saleId}`);
  return { success: true };
}

export async function signAmendmentAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "contract", "EDIT")) return;

  const saleId = String(formData.get("saleId") ?? "");
  const amendmentId = String(formData.get("amendmentId") ?? "");
  if (!amendmentId) return;

  await signAmendment(context, amendmentId);
  revalidatePath(`/sales/${saleId}`);
}

export async function createAssignmentAction(
  _prevState: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "contract", "EDIT")) return { error: "Sem permissão." };

  const saleId = String(formData.get("saleId") ?? "");
  const contractId = String(formData.get("contractId") ?? "");
  const newCustomerId = String(formData.get("newCustomerId") ?? "");
  const assignmentDateRaw = String(formData.get("assignmentDate") ?? "");
  const feeAmountRaw = formData.get("feeAmount");
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  if (!contractId || !newCustomerId || !assignmentDateRaw) {
    return { error: "Selecione o cessionário e a data da cessão." };
  }

  try {
    await createAssignment(context, contractId, {
      newCustomerId,
      assignmentDate: parseDateOnly(assignmentDateRaw),
      feeAmount: feeAmountRaw ? Number(feeAmountRaw) : undefined,
      notes,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar cessão." };
  }

  revalidatePath(`/sales/${saleId}`);
  return { success: true };
}

export async function signAssignmentAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "contract", "EDIT")) return;

  const saleId = String(formData.get("saleId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  if (!assignmentId) return;

  await signAssignment(context, assignmentId);
  revalidatePath(`/sales/${saleId}`);
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
