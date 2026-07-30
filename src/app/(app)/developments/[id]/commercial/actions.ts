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
import { createProposal, submitProposalForApproval, decideProposalApproval } from "@/server/proposals";
import { convertProposalToSale } from "@/server/sales";
import type { ApprovalLevel } from "@/generated/prisma/client";

export type FormState = { error?: string; message?: string };

function revalidateCommercial(developmentId: string) {
  revalidatePath(`/developments/${developmentId}/commercial`);
  revalidatePath(`/developments/${developmentId}`);
  revalidatePath(`/developments/${developmentId}/map`);
  revalidatePath("/sales");
}

export async function createReservationAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
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

  if (!unitId || !customerId) return { error: "Selecione a unidade e o cliente." };

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

  revalidateCommercial(developmentId);
  return {
    message: result.kind === "waitlisted" ? "Unidade já reservada — cliente entrou na fila de espera." : undefined,
  };
}

export async function cancelReservationAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "reservation", "CANCEL")) return;

  const developmentId = String(formData.get("developmentId") ?? "");
  const reservationId = String(formData.get("reservationId") ?? "");
  if (!reservationId) return;

  await cancelReservation(context, reservationId, "Cancelada manualmente");
  revalidateCommercial(developmentId);
}

export async function renewReservationAction(formData: FormData) {
  const context = await requireAccessContext();

  const developmentId = String(formData.get("developmentId") ?? "");
  const reservationId = String(formData.get("reservationId") ?? "");
  if (!reservationId) return;

  const requiresApproval = await reservationRequiresApprovalToRenew(context.organizationId, reservationId);
  const canRenew = requiresApproval
    ? hasPermission(context, "reservation", "APPROVE")
    : hasPermission(context, "reservation", "EDIT");
  if (!canRenew) return;

  await renewReservation(context, reservationId);
  revalidateCommercial(developmentId);
}

export async function cancelWaitlistEntryAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "reservation", "CANCEL")) return;

  const developmentId = String(formData.get("developmentId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  if (!entryId) return;

  await cancelWaitlistEntry(context, entryId);
  revalidateCommercial(developmentId);
}

export async function createProposalAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "proposal", "CREATE")) return { error: "Sem permissão." };

  const developmentId = String(formData.get("developmentId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  const customerId = String(formData.get("customerId") ?? "");
  const salesTableId = String(formData.get("salesTableId") ?? "").trim() || undefined;
  const brokerId = String(formData.get("brokerId") ?? "").trim() || undefined;
  const agencyId = String(formData.get("agencyId") ?? "").trim() || undefined;
  const discountPercent = Number(formData.get("discountPercent") ?? 0);
  const listPriceRaw = formData.get("listPriceOverride");
  const listPriceOverride = listPriceRaw ? Number(listPriceRaw) : undefined;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  const numberField = (key: string) => {
    const raw = formData.get(key);
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isNaN(value) ? undefined : value;
  };
  const proposedDownPaymentPercent = numberField("proposedDownPaymentPercent");
  const proposedMonthlyInstallments = numberField("proposedMonthlyInstallments");
  const proposedKeysInstallmentPercent = numberField("proposedKeysInstallmentPercent");

  if (!unitId || !customerId) return { error: "Selecione a unidade e o cliente." };

  try {
    await createProposal(context, {
      developmentId,
      unitId,
      customerId,
      salesTableId,
      brokerId,
      agencyId,
      discountPercent,
      listPriceOverride,
      notes,
      proposedDownPaymentPercent,
      proposedMonthlyInstallments,
      proposedKeysInstallmentPercent,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar proposta." };
  }

  revalidateCommercial(developmentId);
  return {};
}

export async function submitProposalAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "proposal", "EDIT")) return;

  const developmentId = String(formData.get("developmentId") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");
  if (!proposalId) return;

  await submitProposalForApproval(context, proposalId);
  revalidateCommercial(developmentId);
}

export async function decideApprovalAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "proposal", "APPROVE")) return;

  const developmentId = String(formData.get("developmentId") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");
  const level = String(formData.get("level") ?? "") as ApprovalLevel;
  const decision = String(formData.get("decision") ?? "") as "APPROVED" | "REJECTED";
  if (!proposalId || !level || !decision) return;

  await decideProposalApproval(context, proposalId, level, decision);
  revalidateCommercial(developmentId);
}

export async function convertToSaleAction(formData: FormData) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "sale", "CREATE")) return;

  const developmentId = String(formData.get("developmentId") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");
  if (!proposalId) return;

  await convertProposalToSale(context, proposalId);
  revalidateCommercial(developmentId);
}
