"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  createScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  markScheduledReportGenerated,
  type CreateScheduledReportInput,
} from "@/server/scheduled-reports";
import type { ScheduledReportPeriodicity } from "@/generated/prisma/client";

export type FormState = { error?: string; success?: boolean };

function parseInput(formData: FormData): CreateScheduledReportInput | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const reportKey = String(formData.get("reportKey") ?? "");
  const developmentId = String(formData.get("developmentId") ?? "").trim() || undefined;
  const periodicity = String(formData.get("periodicity") ?? "") as ScheduledReportPeriodicity;
  const recipientsRaw = String(formData.get("recipients") ?? "").trim();
  const recipients = recipientsRaw ? recipientsRaw.split(",").map((r) => r.trim()).filter(Boolean) : [];

  if (!name) return { error: "Informe o nome do agendamento." };
  if (!reportKey) return { error: "Selecione o relatório." };
  if (!["WEEKLY", "MONTHLY", "QUARTERLY"].includes(periodicity)) return { error: "Selecione a periodicidade." };

  return { name, reportKey, developmentId, periodicity, recipients };
}

export async function createScheduledReportAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "EDIT")) return { error: "Sem permissão." };

  const input = parseInput(formData);
  if ("error" in input) return input;

  try {
    await createScheduledReport(context, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar agendamento." };
  }
  revalidatePath("/reports/scheduled");
  return { success: true };
}

export async function updateScheduledReportAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "EDIT")) return { error: "Sem permissão." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Agendamento inválido." };

  const input = parseInput(formData);
  if ("error" in input) return input;

  const isActive = formData.get("isActive") === "on";

  try {
    await updateScheduledReport(context, id, { ...input, isActive });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar agendamento." };
  }
  revalidatePath("/reports/scheduled");
  return { success: true };
}

export async function deleteScheduledReportAction(id: string): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "EDIT")) return { error: "Sem permissão." };

  try {
    await deleteScheduledReport(context, id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao excluir agendamento." };
  }
  revalidatePath("/reports/scheduled");
  return { success: true };
}

export async function markScheduledReportGeneratedAction(id: string): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "EDIT")) return { error: "Sem permissão." };

  try {
    await markScheduledReportGenerated(context, id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao registrar geração." };
  }
  revalidatePath("/reports/scheduled");
  return { success: true };
}
