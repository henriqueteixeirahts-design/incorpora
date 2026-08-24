"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  createExchangeContract,
  updateExchangeContract,
  deleteExchangeContract,
  uploadExchangeContractDocument,
  destacarUnidade,
  removerDestaque,
  type CreateExchangeContractInput,
} from "@/server/exchange-contracts";
import {
  listExchangeRepasses,
  getExchangeRetentionBalance,
  releaseExchangeRetention,
  listApurationPeriods,
  closeExchangeApurationPeriod,
} from "@/server/exchange-repasse";
import {
  getExchangeFinancialTerms,
  upsertExchangeFinancialTerms,
  type UpsertExchangeFinancialTermsInput,
} from "@/server/exchange-financial-terms";
import type {
  ExchangeContractType,
  ExchangeContractStatus,
  ExchangeRetentionReleaseTrigger,
  ExchangeIncidenceScope,
  ExchangePayoutFlow,
  ExchangeDeductionBase,
} from "@/generated/prisma/client";

export type FormState = { error?: string; success?: boolean };

function revalidateAll(developmentId: string) {
  revalidatePath(`/developments/${developmentId}/exchange-contracts`);
  revalidatePath(`/developments/${developmentId}/map`);
}

function parseExchangeContractInput(
  formData: FormData,
): Omit<CreateExchangeContractInput, "developmentId"> | { error: string } {
  const permutanteId = String(formData.get("permutanteId") ?? "");
  const type = String(formData.get("type") ?? "") as ExchangeContractType;
  const appraisalValueRaw = String(formData.get("appraisalValue") ?? "").replace(",", ".");
  const contractDateRaw = String(formData.get("contractDate") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const status = String(formData.get("status") ?? "ACTIVE") as ExchangeContractStatus;
  const managedBySystemRaw = String(formData.get("managedBySystem") ?? "");
  const administrationFeePctRaw = String(formData.get("administrationFeePct") ?? "").replace(",", ".");
  const retentionPctRaw = String(formData.get("retentionPct") ?? "").replace(",", ".");
  const retentionReleaseTriggerRaw = String(formData.get("retentionReleaseTrigger") ?? "") as ExchangeRetentionReleaseTrigger | "";
  const retentionReleaseDateRaw = String(formData.get("retentionReleaseDate") ?? "");
  const landIds = formData.getAll("landIds").map(String).filter(Boolean);

  if (!permutanteId) return { error: "Selecione o permutante." };
  if (!["PHYSICAL", "FINANCIAL", "MIXED"].includes(type)) return { error: "Selecione o tipo de permuta." };
  if (!contractDateRaw) return { error: "Informe a data do contrato." };

  const appraisalValue = appraisalValueRaw ? Number(appraisalValueRaw) : undefined;
  if (appraisalValue !== undefined && (Number.isNaN(appraisalValue) || appraisalValue < 0)) {
    return { error: "Valor de avaliação inválido." };
  }
  const administrationFeePct = administrationFeePctRaw ? Number(administrationFeePctRaw) : undefined;
  if (
    administrationFeePct !== undefined &&
    (Number.isNaN(administrationFeePct) || administrationFeePct < 0 || administrationFeePct > 100)
  ) {
    return { error: "Taxa de administração inválida." };
  }
  const retentionPct = retentionPctRaw ? Number(retentionPctRaw) : undefined;
  if (retentionPct !== undefined && (Number.isNaN(retentionPct) || retentionPct < 0 || retentionPct > 100)) {
    return { error: "Percentual de retenção inválido." };
  }
  if (retentionReleaseTriggerRaw && !["HABITE_SE", "DELIVERY", "FIXED_DATE", "CONSTRUCTION_PROGRESS"].includes(retentionReleaseTriggerRaw)) {
    return { error: "Gatilho de liberação da retenção inválido." };
  }

  return {
    permutanteId,
    type,
    appraisalValue,
    contractDate: new Date(contractDateRaw),
    notes: notes || undefined,
    status,
    managedBySystem: type === "FINANCIAL" ? undefined : managedBySystemRaw === "true",
    administrationFeePct,
    retentionPct,
    retentionReleaseTrigger: retentionReleaseTriggerRaw || undefined,
    retentionReleaseDate: retentionReleaseDateRaw ? new Date(retentionReleaseDateRaw) : undefined,
    landIds,
  };
}

export async function createExchangeContractAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "exchange_contract", "CREATE")) return { error: "Sem permissão." };

  const developmentId = String(formData.get("developmentId") ?? "");
  if (!developmentId) return { error: "Empreendimento inválido." };

  const input = parseExchangeContractInput(formData);
  if ("error" in input) return input;

  try {
    await createExchangeContract(context, { developmentId, ...input });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar contrato de permuta." };
  }
  revalidateAll(developmentId);
  return { success: true };
}

export async function updateExchangeContractAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "exchange_contract", "EDIT")) return { error: "Sem permissão." };

  const developmentId = String(formData.get("developmentId") ?? "");
  const contractId = String(formData.get("contractId") ?? "");
  if (!developmentId || !contractId) return { error: "Contrato inválido." };

  const input = parseExchangeContractInput(formData);
  if ("error" in input) return input;

  try {
    await updateExchangeContract(context, contractId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar contrato de permuta." };
  }
  revalidateAll(developmentId);
  return { success: true };
}

export async function deleteExchangeContractAction(
  developmentId: string,
  contractId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "exchange_contract", "DELETE")) return { error: "Sem permissão." };

  try {
    await deleteExchangeContract(context, contractId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao excluir contrato de permuta." };
  }
  revalidateAll(developmentId);
  return { success: true };
}

export async function uploadExchangeContractDocumentAction(
  developmentId: string,
  contractId: string,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "exchange_contract", "EDIT")) return { error: "Sem permissão." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };

  try {
    await uploadExchangeContractDocument(context, contractId, file);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao enviar anexo." };
  }
  revalidateAll(developmentId);
  return { success: true };
}

export async function destacarUnidadeAction(
  developmentId: string,
  contractId: string,
  unitId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "exchange_contract", "EDIT")) return { error: "Sem permissão." };

  try {
    await destacarUnidade(context, contractId, unitId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao destacar unidade." };
  }
  revalidateAll(developmentId);
  return { success: true };
}

export async function getExchangeRepasseSummaryAction(contractId: string) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "exchange_contract", "VIEW")) return null;
  try {
    const [repasses, retentionBalance] = await Promise.all([
      listExchangeRepasses(context, contractId),
      getExchangeRetentionBalance(context, contractId),
    ]);
    return {
      repasses: repasses.map((r) => ({
        id: r.id,
        grossBase: Number(r.grossBase),
        administrationFeeAmount: Number(r.administrationFeeAmount),
        externalCommissionAmount: Number(r.externalCommissionAmount),
        internalCommissionAmount: Number(r.internalCommissionAmount),
        share: Number(r.share),
        referenceDate: r.referenceDate,
      })),
      retentionBalance,
    };
  } catch {
    return null;
  }
}

export async function releaseExchangeRetentionAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "exchange_contract", "EDIT") || !hasPermission(context, "payable", "CREATE")) {
    return { error: "Sem permissão." };
  }

  const developmentId = String(formData.get("developmentId") ?? "");
  const contractId = String(formData.get("contractId") ?? "");
  if (!developmentId || !contractId) return { error: "Contrato inválido." };

  const amountRaw = String(formData.get("amount") ?? "").replace(",", ".");
  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) return { error: "Informe um valor válido." };
  const releaseDateRaw = String(formData.get("releaseDate") ?? "");
  if (!releaseDateRaw) return { error: "Informe a data de liberação." };
  const notes = String(formData.get("notes") ?? "").trim();

  try {
    await releaseExchangeRetention(context, contractId, {
      amount,
      releaseDate: new Date(releaseDateRaw),
      notes: notes || undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao liberar retenção." };
  }
  revalidateAll(developmentId);
  return { success: true };
}

export async function getExchangeFinancialTermsAction(contractId: string) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "exchange_contract", "VIEW")) return null;
  try {
    const terms = await getExchangeFinancialTerms(context, contractId);
    if (!terms) return null;
    return {
      ...terms,
      percent: Number(terms.percent),
      incidenceCapValue: terms.incidenceCapValue === null ? null : Number(terms.incidenceCapValue),
      milestoneTargetUnitsSoldPct: terms.milestoneTargetUnitsSoldPct === null ? null : Number(terms.milestoneTargetUnitsSoldPct),
      retentionPct: terms.retentionPct === null ? null : Number(terms.retentionPct),
    };
  } catch {
    return null;
  }
}

function parseFinancialTermsInput(formData: FormData): UpsertExchangeFinancialTermsInput | { error: string } {
  const percentRaw = String(formData.get("ft-percent") ?? "").replace(",", ".");
  const incidenceScope = String(formData.get("ft-incidenceScope") ?? "") as ExchangeIncidenceScope;
  const incidenceCapValueRaw = String(formData.get("ft-incidenceCapValue") ?? "").replace(",", ".");
  const payoutFlow = String(formData.get("ft-payoutFlow") ?? "") as ExchangePayoutFlow;
  const milestoneDescription = String(formData.get("ft-milestoneDescription") ?? "").trim();
  const milestoneTargetRaw = String(formData.get("ft-milestoneTarget") ?? "").replace(",", ".");
  const deductionBase = String(formData.get("ft-deductionBase") ?? "") as ExchangeDeductionBase;
  const deductCommission = formData.get("ft-deductCommission") === "on";
  const deductTax = formData.get("ft-deductTax") === "on";
  const retentionPctRaw = String(formData.get("ft-retentionPct") ?? "").replace(",", ".");

  const percent = Number(percentRaw);
  if (!percentRaw || Number.isNaN(percent) || percent <= 0 || percent > 100) return { error: "Informe o percentual do permutante." };
  if (!["ALL_UNITS", "SPECIFIC_UNITS", "VALUE_CAP"].includes(incidenceScope)) return { error: "Selecione a incidência." };
  if (!["ON_RECEIPT", "MONTHLY_CONSOLIDATED", "MILESTONES"].includes(payoutFlow)) return { error: "Selecione o fluxo de repasse." };
  if (!["GROSS", "NET"].includes(deductionBase)) return { error: "Selecione a base de cálculo." };

  const incidenceCapValue = incidenceCapValueRaw ? Number(incidenceCapValueRaw) : undefined;
  if (incidenceScope === "VALUE_CAP" && (!incidenceCapValue || incidenceCapValue <= 0)) {
    return { error: "Informe o valor-teto da incidência." };
  }
  const milestoneTargetUnitsSoldPct = milestoneTargetRaw ? Number(milestoneTargetRaw) : undefined;
  const retentionPct = retentionPctRaw ? Number(retentionPctRaw) : undefined;
  if (retentionPct !== undefined && (Number.isNaN(retentionPct) || retentionPct < 0 || retentionPct > 100)) {
    return { error: "Percentual de retenção inválido." };
  }

  return {
    percent,
    incidenceScope,
    incidenceCapValue,
    payoutFlow,
    milestoneDescription: milestoneDescription || undefined,
    milestoneTargetUnitsSoldPct,
    deductionBase,
    deductCommission,
    deductTax,
    retentionPct,
  };
}

export async function upsertExchangeFinancialTermsAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "exchange_contract", "EDIT")) return { error: "Sem permissão." };

  const developmentId = String(formData.get("developmentId") ?? "");
  const contractId = String(formData.get("contractId") ?? "");
  if (!developmentId || !contractId) return { error: "Contrato inválido." };

  const input = parseFinancialTermsInput(formData);
  if ("error" in input) return input;

  try {
    await upsertExchangeFinancialTerms(context, contractId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao salvar condições financeiras." };
  }
  revalidateAll(developmentId);
  return { success: true };
}

export async function getApurationPeriodsAction(contractId: string) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "exchange_contract", "VIEW")) return [];
  try {
    const periods = await listApurationPeriods(context, contractId);
    return periods.map((p) => ({
      id: p.id,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      status: p.status,
      grossAccrued: p.repasses.reduce((sum, r) => sum + Number(r.share), 0),
      commissionDeduction: p.commissionDeduction === null ? null : Number(p.commissionDeduction),
      taxDeduction: p.taxDeduction === null ? null : Number(p.taxDeduction),
      retainedAmount: p.retainedAmount === null ? null : Number(p.retainedAmount),
      netAmount: p.netAmount === null ? null : Number(p.netAmount),
    }));
  } catch {
    return [];
  }
}

export async function closeApurationPeriodAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "exchange_contract", "EDIT") || !hasPermission(context, "payable", "CREATE")) {
    return { error: "Sem permissão." };
  }

  const developmentId = String(formData.get("developmentId") ?? "");
  const periodId = String(formData.get("periodId") ?? "");
  if (!developmentId || !periodId) return { error: "Período inválido." };

  const commissionDeductionRaw = String(formData.get("commissionDeduction") ?? "").replace(",", ".");
  const taxDeductionRaw = String(formData.get("taxDeduction") ?? "").replace(",", ".");

  try {
    await closeExchangeApurationPeriod(context, periodId, {
      commissionDeduction: commissionDeductionRaw ? Number(commissionDeductionRaw) : undefined,
      taxDeduction: taxDeductionRaw ? Number(taxDeductionRaw) : undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao fechar período de apuração." };
  }
  revalidateAll(developmentId);
  return { success: true };
}

export async function removerDestaqueAction(
  developmentId: string,
  contractId: string,
  unitId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "exchange_contract", "EDIT")) return { error: "Sem permissão." };

  try {
    await removerDestaque(context, contractId, unitId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao remover destaque." };
  }
  revalidateAll(developmentId);
  return { success: true };
}
