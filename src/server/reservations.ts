import "server-only";

import { prisma, type TransactionClient } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { changeUnitStatusTx } from "@/server/units";
import { getEffectiveReservationRule } from "@/server/reservation-rules";
import type { AccessContext } from "@/server/auth-context";
import { developmentIdAccessScope, canAccessDevelopment } from "@/server/scope";
import type { Unit, Reservation, ReservationWaitlistEntry } from "@/generated/prisma/client";

export function listReservations(context: AccessContext) {
  return prisma.reservation.findMany({
    where: {
      organizationId: context.organizationId,
      ...(context.developmentAccess === "ALL" ? {} : { unit: { developmentId: { in: [...context.developmentAccess] } } }),
    },
    include: { unit: true, customer: true, broker: true, agency: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listWaitlistForUnit(context: AccessContext, unitId: string) {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, development: { organizationId: context.organizationId } },
    select: { developmentId: true },
  });
  if (!unit || !canAccessDevelopment(context, unit.developmentId)) return [];

  return prisma.reservationWaitlistEntry.findMany({
    where: { unitId, status: "WAITING" },
    include: { customer: true, broker: true },
    orderBy: { createdAt: "asc" },
  });
}

export function listWaitlistForOrganization(context: AccessContext) {
  return prisma.reservationWaitlistEntry.findMany({
    where: {
      status: "WAITING",
      unit: { development: { organizationId: context.organizationId, ...developmentIdAccessScope(context) } },
    },
    include: { unit: true, customer: true, broker: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Libera a unidade (RESERVED -> AVAILABLE) e, se houver fila de espera não
 * vazia, promove o primeiro da fila a uma reserva de verdade na hora —
 * prazo de prioridade (não o prazo normal), unidade volta pra RESERVED sob
 * o nome de quem estava na fila. Compartilhado entre cancelamento e
 * expiração (docs/ESPEC_MODULO_COMERCIAL.md, Parte 2 — comportamentos).
 */
async function releaseUnitAndPromoteWaitlist(
  tx: TransactionClient,
  params: {
    organizationId: string;
    unit: Unit;
    actorUserId?: string | null;
    releaseReason: string;
  },
) {
  const { organizationId, unit, actorUserId, releaseReason } = params;

  if (unit.status === "RESERVED") {
    await changeUnitStatusTx(tx, {
      organizationId,
      developmentId: unit.developmentId,
      unitId: unit.id,
      fromStatus: unit.status,
      toStatus: "AVAILABLE",
      actorUserId,
      reason: releaseReason,
    });
  }

  const nextInLine = await tx.reservationWaitlistEntry.findFirst({
    where: { unitId: unit.id, status: "WAITING" },
    orderBy: { createdAt: "asc" },
  });
  if (!nextInLine) return null;

  const rule = await getEffectiveReservationRule(organizationId, unit.developmentId);
  const expiresAt = new Date(Date.now() + rule.waitlistPriorityHours * 60 * 60 * 1000);

  const promoted = await tx.reservation.create({
    data: {
      organizationId,
      unitId: unit.id,
      customerId: nextInLine.customerId,
      brokerId: nextInLine.brokerId,
      agencyId: nextInLine.agencyId,
      expiresAt,
      reason: "Promovida da fila de espera",
      fromWaitlist: true,
    },
  });

  await changeUnitStatusTx(tx, {
    organizationId,
    developmentId: unit.developmentId,
    unitId: unit.id,
    fromStatus: "AVAILABLE",
    toStatus: "RESERVED",
    actorUserId,
    reason: "Unidade reservada automaticamente pra o primeiro da fila de espera",
  });

  await tx.reservationWaitlistEntry.update({
    where: { id: nextInLine.id },
    data: { status: "CONVERTED", convertedAt: new Date(), convertedReservationId: promoted.id },
  });

  await recordDevelopmentEvent(tx, {
    organizationId,
    developmentId: unit.developmentId,
    actorUserId,
    eventType: "reservation.waitlist_promoted",
    entityType: "Reservation",
    entityId: promoted.id,
    payload: { unitId: unit.id, customerId: nextInLine.customerId, waitlistEntryId: nextInLine.id },
  });

  return promoted;
}

/**
 * Expira reservas vencidas da organização e promove a fila de espera de
 * cada unidade liberada — o trabalho de fundo por trás do job
 * `expire-reservations` (src/server/jobs.ts). Chamado tanto pelo job (cron
 * futuro/manual) quanto por gatilho de evento (carregar o espelho), sempre
 * pelo mesmo caminho de código.
 */
export async function expireReservationsForOrganization(organizationId: string) {
  const overdue = await prisma.reservation.findMany({
    where: { organizationId, status: "ACTIVE", expiresAt: { lt: new Date() } },
    include: { unit: true },
  });

  let expiredCount = 0;
  let promotedCount = 0;

  for (const reservation of overdue) {
    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: "EXPIRED" },
      });

      await recordDevelopmentEvent(tx, {
        organizationId,
        developmentId: reservation.unit.developmentId,
        eventType: "reservation.expired",
        entityType: "Reservation",
        entityId: reservation.id,
      });

      const promoted = await releaseUnitAndPromoteWaitlist(tx, {
        organizationId,
        unit: reservation.unit,
        releaseReason: "Reserva expirada",
      });
      if (promoted) promotedCount += 1;
    });
    expiredCount += 1;
  }

  return { expired: expiredCount, promotedFromWaitlist: promotedCount };
}

export type CreateReservationInput = {
  unitId: string;
  customerId: string;
  brokerId?: string;
  agencyId?: string;
  salesTableId?: string;
  expiresAt: Date;
  reason?: string;
};

export type CreateReservationResult =
  | { kind: "reservation"; reservation: Reservation }
  | { kind: "waitlisted"; entry: ReservationWaitlistEntry };

export async function createReservation(
  context: AccessContext,
  input: CreateReservationInput,
): Promise<CreateReservationResult> {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findFirst({
      where: { id: input.unitId, development: { organizationId: context.organizationId } },
    });
    if (!unit || !canAccessDevelopment(context, unit.developmentId)) throw new Error("Unidade inválida.");

    const rule = await getEffectiveReservationRule(context.organizationId, unit.developmentId);

    if (rule.allowedReserverRoles.length > 0) {
      const allowed = context.roleNames.some((role) => rule.allowedReserverRoles.includes(role));
      if (!allowed) throw new Error("Seu papel não tem permissão pra reservar unidades deste empreendimento.");
    }

    if (input.brokerId && rule.maxActiveReservationsPerBroker !== null) {
      const activeCount = await tx.reservation.count({
        where: {
          brokerId: input.brokerId,
          status: "ACTIVE",
          unit: { developmentId: unit.developmentId },
        },
      });
      if (activeCount >= rule.maxActiveReservationsPerBroker) {
        throw new Error(
          `Corretor já atingiu o máximo de ${rule.maxActiveReservationsPerBroker} reservas ativas neste empreendimento.`,
        );
      }
    }

    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, organizationId: context.organizationId },
    });
    if (!customer) throw new Error("Cliente inválido.");
    if (input.brokerId) {
      const broker = await tx.broker.findFirst({ where: { id: input.brokerId, organizationId: context.organizationId } });
      if (!broker) throw new Error("Corretor inválido.");
    }
    if (input.agencyId) {
      const agency = await tx.realEstateAgency.findFirst({
        where: { id: input.agencyId, organizationId: context.organizationId },
      });
      if (!agency) throw new Error("Imobiliária inválida.");
    }
    if (input.salesTableId) {
      const salesTable = await tx.salesTable.findFirst({
        where: { id: input.salesTableId, development: { organizationId: context.organizationId } },
      });
      if (!salesTable) throw new Error("Tabela de vendas inválida.");
    }

    if (unit.status !== "AVAILABLE") {
      if (unit.status === "RESERVED" && rule.waitlistEnabled) {
        const alreadyQueued = await tx.reservationWaitlistEntry.findFirst({
          where: { unitId: unit.id, customerId: input.customerId, status: "WAITING" },
        });
        if (alreadyQueued) throw new Error("Este cliente já está na fila de espera desta unidade.");

        const entry = await tx.reservationWaitlistEntry.create({
          data: {
            unitId: input.unitId,
            customerId: input.customerId,
            brokerId: input.brokerId,
            agencyId: input.agencyId,
          },
        });

        await recordAuditEvent(tx, {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "create",
          entityType: "ReservationWaitlistEntry",
          entityId: entry.id,
          afterData: entry,
        });

        await recordDevelopmentEvent(tx, {
          organizationId: context.organizationId,
          developmentId: unit.developmentId,
          actorUserId: context.userId,
          eventType: "reservation.waitlist_joined",
          entityType: "ReservationWaitlistEntry",
          entityId: entry.id,
          payload: { unitId: input.unitId, customerId: input.customerId },
        });

        return { kind: "waitlisted", entry };
      }
      throw new Error("Unidade não está disponível para reserva.");
    }

    const reservation = await tx.reservation.create({
      data: {
        organizationId: context.organizationId,
        unitId: input.unitId,
        customerId: input.customerId,
        brokerId: input.brokerId,
        agencyId: input.agencyId,
        salesTableId: input.salesTableId,
        expiresAt: input.expiresAt,
        reason: input.reason,
        createdByUserId: context.userId,
      },
    });

    await changeUnitStatusTx(tx, {
      organizationId: context.organizationId,
      developmentId: unit.developmentId,
      unitId: input.unitId,
      fromStatus: unit.status,
      toStatus: "RESERVED",
      actorUserId: context.userId,
      reason: "Reserva criada",
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "Reservation",
      entityId: reservation.id,
      afterData: reservation,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: unit.developmentId,
      actorUserId: context.userId,
      eventType: "reservation.created",
      entityType: "Reservation",
      entityId: reservation.id,
      payload: { unitId: input.unitId, customerId: input.customerId },
    });

    return { kind: "reservation", reservation };
  });
}

export async function cancelReservation(
  context: AccessContext,
  reservationId: string,
  cancelReason?: string,
) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: { id: reservationId, organizationId: context.organizationId },
      include: { unit: true },
    });
    if (!reservation || !canAccessDevelopment(context, reservation.unit.developmentId)) throw new Error("Reserva inválida.");
    if (reservation.status !== "ACTIVE") throw new Error("Reserva não está ativa.");

    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "cancel",
      entityType: "Reservation",
      entityId: reservationId,
      beforeData: { status: "ACTIVE" },
      afterData: { status: "CANCELLED", cancelReason },
    });

    await releaseUnitAndPromoteWaitlist(tx, {
      organizationId: context.organizationId,
      unit: reservation.unit,
      actorUserId: context.userId,
      releaseReason: "Reserva cancelada",
    });

    return updated;
  });
}

export async function cancelWaitlistEntry(context: AccessContext, entryId: string) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.reservationWaitlistEntry.findFirst({
      where: { id: entryId, status: "WAITING", unit: { development: { organizationId: context.organizationId } } },
      include: { unit: true },
    });
    if (!entry || !canAccessDevelopment(context, entry.unit.developmentId)) throw new Error("Entrada na fila não encontrada.");

    const updated = await tx.reservationWaitlistEntry.update({
      where: { id: entryId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "cancel",
      entityType: "ReservationWaitlistEntry",
      entityId: entryId,
      beforeData: { status: "WAITING" },
      afterData: { status: "CANCELLED" },
    });

    return updated;
  });
}

/**
 * Renovação de reserva (Parte 2) — teto de renovações e, quando exigido
 * pela regra do empreendimento, só quem tem alçada de aprovação
 * (`reservation.APPROVE`, checado na action, não aqui) pode renovar.
 */
export async function reservationRequiresApprovalToRenew(
  context: AccessContext,
  reservationId: string,
): Promise<boolean> {
  const reservation = await prisma.reservation.findFirst({
    where: { id: reservationId, organizationId: context.organizationId },
    include: { unit: true },
  });
  if (!reservation || !canAccessDevelopment(context, reservation.unit.developmentId)) throw new Error("Reserva inválida.");
  const rule = await getEffectiveReservationRule(context.organizationId, reservation.unit.developmentId);
  return rule.requiresApprovalForRenewal;
}

export async function renewReservation(context: AccessContext, reservationId: string) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: { id: reservationId, organizationId: context.organizationId },
      include: { unit: true },
    });
    if (!reservation || !canAccessDevelopment(context, reservation.unit.developmentId)) throw new Error("Reserva inválida.");
    if (reservation.status !== "ACTIVE") throw new Error("Reserva não está ativa.");

    const rule = await getEffectiveReservationRule(context.organizationId, reservation.unit.developmentId);
    if (!rule.renewalAllowed) throw new Error("Este empreendimento não permite renovação de reserva.");
    if (reservation.renewalCount >= rule.maxRenewals) {
      throw new Error(`Limite de ${rule.maxRenewals} renovação(ões) já atingido.`);
    }

    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        expiresAt: new Date(Date.now() + rule.validityHours * 60 * 60 * 1000),
        renewalCount: { increment: 1 },
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Reservation",
      entityId: reservationId,
      beforeData: { expiresAt: reservation.expiresAt, renewalCount: reservation.renewalCount },
      afterData: { expiresAt: updated.expiresAt, renewalCount: updated.renewalCount },
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: reservation.unit.developmentId,
      actorUserId: context.userId,
      eventType: "reservation.renewed",
      entityType: "Reservation",
      entityId: reservationId,
      payload: { renewalCount: updated.renewalCount, expiresAt: updated.expiresAt },
    });

    return updated;
  });
}
