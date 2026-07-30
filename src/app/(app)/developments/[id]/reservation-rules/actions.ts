"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { upsertReservationRule, type UpsertReservationRuleInput } from "@/server/reservation-rules";

export type FormState = { error?: string; success?: boolean };

function parseReservationRuleInput(formData: FormData): UpsertReservationRuleInput | { error: string } {
  const validityHours = Number(formData.get("validityHours") ?? 48);
  const maxActiveRaw = String(formData.get("maxActiveReservationsPerBroker") ?? "").trim();
  const waitlistEnabled = formData.get("waitlistEnabled") === "on";
  const waitlistPriorityHours = Number(formData.get("waitlistPriorityHours") ?? 24);
  const renewalAllowed = formData.get("renewalAllowed") === "on";
  const maxRenewals = Number(formData.get("maxRenewals") ?? 1);
  const requiresApprovalForRenewal = formData.get("requiresApprovalForRenewal") === "on";
  const requireIdentifiedCustomer = formData.get("requireIdentifiedCustomer") === "on";
  const allowedReserverRoles = formData.getAll("allowedReserverRoles").map(String).filter(Boolean);

  if (!Number.isInteger(validityHours) || validityHours <= 0) {
    return { error: "Prazo de validade da reserva deve ser um número inteiro de horas maior que zero." };
  }
  if (!Number.isInteger(waitlistPriorityHours) || waitlistPriorityHours <= 0) {
    return { error: "Prazo de prioridade da fila deve ser um número inteiro de horas maior que zero." };
  }
  if (!Number.isInteger(maxRenewals) || maxRenewals < 0) {
    return { error: "Máximo de renovações inválido." };
  }
  const maxActiveReservationsPerBroker = maxActiveRaw ? Number(maxActiveRaw) : null;
  if (
    maxActiveReservationsPerBroker !== null &&
    (!Number.isInteger(maxActiveReservationsPerBroker) || maxActiveReservationsPerBroker <= 0)
  ) {
    return { error: "Máximo de reservas ativas por corretor inválido." };
  }

  return {
    validityHours,
    maxActiveReservationsPerBroker,
    waitlistEnabled,
    waitlistPriorityHours,
    renewalAllowed,
    maxRenewals,
    requiresApprovalForRenewal,
    requireIdentifiedCustomer,
    allowedReserverRoles,
  };
}

export async function upsertReservationRuleAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "EDIT")) return { error: "Sem permissão." };

  const developmentId = String(formData.get("developmentId") ?? "");
  if (!developmentId) return { error: "Empreendimento inválido." };

  const input = parseReservationRuleInput(formData);
  if ("error" in input) return input;

  try {
    await upsertReservationRule(context, developmentId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao salvar regras de reserva." };
  }
  revalidatePath(`/developments/${developmentId}/reservation-rules`);
  return { success: true };
}
