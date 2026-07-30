import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { orgScope } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";

const ENTITY_TYPE = "ReservationRule";

/** Defaults sugeridos pela especificação (Parte 2) — valem quando o empreendimento ainda não tem regra configurada. */
export const DEFAULT_RESERVATION_RULE = {
  validityHours: 48,
  maxActiveReservationsPerBroker: 3 as number | null,
  waitlistEnabled: true,
  waitlistPriorityHours: 24,
  renewalAllowed: true,
  maxRenewals: 1,
  requiresApprovalForRenewal: true,
  requireIdentifiedCustomer: true,
  allowedReserverRoles: [] as string[],
};

export type ReservationRuleValues = typeof DEFAULT_RESERVATION_RULE;

/** Regra efetiva do empreendimento — a configurada, ou os defaults sugeridos quando não há linha ainda. */
export async function getEffectiveReservationRule(developmentId: string): Promise<ReservationRuleValues> {
  const rule = await prisma.reservationRule.findUnique({ where: { developmentId } });
  if (!rule) return DEFAULT_RESERVATION_RULE;
  return {
    validityHours: rule.validityHours,
    maxActiveReservationsPerBroker: rule.maxActiveReservationsPerBroker,
    waitlistEnabled: rule.waitlistEnabled,
    waitlistPriorityHours: rule.waitlistPriorityHours,
    renewalAllowed: rule.renewalAllowed,
    maxRenewals: rule.maxRenewals,
    requiresApprovalForRenewal: rule.requiresApprovalForRenewal,
    requireIdentifiedCustomer: rule.requireIdentifiedCustomer,
    allowedReserverRoles: rule.allowedReserverRoles,
  };
}

/** Regra bruta (ou null se ainda não configurada) — pra distinguir "usando os defaults" de "customizada" na tela. */
export async function getReservationRule(context: AccessContext, developmentId: string) {
  const development = await prisma.development.findFirst({
    where: { id: developmentId, ...orgScope(context) },
  });
  if (!development) return null;
  return prisma.reservationRule.findUnique({ where: { developmentId } });
}

export type UpsertReservationRuleInput = ReservationRuleValues;

export async function upsertReservationRule(
  context: AccessContext,
  developmentId: string,
  input: UpsertReservationRuleInput,
) {
  const development = await prisma.development.findFirst({
    where: { id: developmentId, ...orgScope(context) },
  });
  if (!development) throw new Error("Empreendimento não encontrado.");

  const before = await prisma.reservationRule.findUnique({ where: { developmentId } });

  return prisma.$transaction(async (tx) => {
    const rule = await tx.reservationRule.upsert({
      where: { developmentId },
      create: { developmentId, ...input },
      update: input,
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: before ? "update" : "create",
      entityType: ENTITY_TYPE,
      entityId: rule.id,
      beforeData: before ?? undefined,
      afterData: rule,
    });

    return rule;
  });
}
