"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  createReservation,
  cancelReservation,
  cancelWaitlistEntry,
  renewReservation,
  reservationRequiresApprovalToRenew,
} from "@/server/reservations";
import { destacarUnidade, removerDestaque } from "@/server/exchange-contracts";

export type FormState = { error?: string; success?: boolean; message?: string };

function revalidateMap(developmentId: string) {
  revalidatePath(`/developments/${developmentId}/map`);
  revalidatePath(`/developments/${developmentId}/commercial`);
  revalidatePath(`/developments/${developmentId}/exchange-contracts`);
}

export async function createReservationFromMapAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "reservation", "CREATE")) return { error: "Sem permissão." };

  const developmentId = String(formData.get("developmentId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  const customerId = String(formData.get("customerId") ?? "");
  const brokerId = String(formData.get("brokerId") ?? "").trim() || undefined;
  const agencyId = String(formData.get("agencyId") ?? "").trim() || undefined;
  const salesTableId = String(formData.get("salesTableId") ?? "").trim() || undefined;
  const hours = Number(formData.get("expiresInHours") ?? 48);
  const reason = String(formData.get("reason") ?? "").trim() || undefined;

  if (!unitId || !customerId) return { error: "Selecione o cliente." };

  let result;
  try {
    result = await createReservation(context, {
      unitId,
      customerId,
      brokerId,
      agencyId,
      salesTableId,
      expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
      reason,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar reserva." };
  }
  revalidateMap(developmentId);
  return {
    success: true,
    message: result.kind === "waitlisted" ? "Unidade já reservada — cliente entrou na fila de espera." : undefined,
  };
}

export async function cancelReservationFromMapAction(
  developmentId: string,
  reservationId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "reservation", "CANCEL")) return { error: "Sem permissão." };

  try {
    await cancelReservation(context, reservationId, "Cancelada manualmente");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao cancelar reserva." };
  }
  revalidateMap(developmentId);
  return { success: true };
}

export async function cancelWaitlistEntryFromMapAction(
  developmentId: string,
  entryId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "reservation", "CANCEL")) return { error: "Sem permissão." };

  try {
    await cancelWaitlistEntry(context, entryId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao sair da fila de espera." };
  }
  revalidateMap(developmentId);
  return { success: true };
}

export async function renewReservationFromMapAction(
  developmentId: string,
  reservationId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();

  try {
    const requiresApproval = await reservationRequiresApprovalToRenew(context.organizationId, reservationId);
    const canRenew = requiresApproval
      ? hasPermission(context, "reservation", "APPROVE")
      : hasPermission(context, "reservation", "EDIT");
    if (!canRenew) return { error: "Sem permissão pra renovar esta reserva." };

    await renewReservation(context, reservationId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao renovar reserva." };
  }
  revalidateMap(developmentId);
  return { success: true };
}

export async function destacarUnidadeFromMapAction(
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
  revalidateMap(developmentId);
  return { success: true };
}

export async function removerDestaqueFromMapAction(
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
  revalidateMap(developmentId);
  return { success: true };
}
