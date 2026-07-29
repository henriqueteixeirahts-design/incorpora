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
import type { ExchangeContractType, ExchangeContractStatus } from "@/generated/prisma/client";

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

  return {
    permutanteId,
    type,
    appraisalValue,
    contractDate: new Date(contractDateRaw),
    notes: notes || undefined,
    status,
    managedBySystem: type === "FINANCIAL" ? undefined : managedBySystemRaw === "true",
    administrationFeePct,
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
