import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { changeUnitStatusTx } from "@/server/units";
import type { AccessContext } from "@/server/auth-context";

export function listReservations(organizationId: string) {
  return prisma.reservation.findMany({
    where: { organizationId },
    include: { unit: true, customer: true, broker: true, agency: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Sem worker assíncrono ainda (Fase 1 técnica prevê um, mas não está no ar):
 * varredura preguiçosa que expira reservas vencidas e libera a unidade
 * sempre que a lista é consultada. Substituir por job agendado quando
 * houver infraestrutura de fila.
 */
export async function expireOverdueReservations(organizationId: string) {
  const overdue = await prisma.reservation.findMany({
    where: { organizationId, status: "ACTIVE", expiresAt: { lt: new Date() } },
    include: { unit: true },
  });

  for (const reservation of overdue) {
    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: "EXPIRED" },
      });

      if (reservation.unit.status === "RESERVED") {
        await changeUnitStatusTx(tx, {
          organizationId,
          developmentId: reservation.unit.developmentId,
          unitId: reservation.unitId,
          fromStatus: reservation.unit.status,
          toStatus: "AVAILABLE",
          reason: "Reserva expirada",
        });
      }

      await recordDevelopmentEvent(tx, {
        organizationId,
        developmentId: reservation.unit.developmentId,
        eventType: "reservation.expired",
        entityType: "Reservation",
        entityId: reservation.id,
      });
    });
  }
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

export async function createReservation(
  context: AccessContext,
  input: CreateReservationInput,
) {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findFirst({
      where: { id: input.unitId, development: { organizationId: context.organizationId } },
    });
    if (!unit) throw new Error("Unidade inválida.");
    if (unit.status !== "AVAILABLE") {
      throw new Error("Unidade não está disponível para reserva.");
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

    return reservation;
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
    if (!reservation) throw new Error("Reserva inválida.");
    if (reservation.status !== "ACTIVE") throw new Error("Reserva não está ativa.");

    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason },
    });

    if (reservation.unit.status === "RESERVED") {
      await changeUnitStatusTx(tx, {
        organizationId: context.organizationId,
        developmentId: reservation.unit.developmentId,
        unitId: reservation.unitId,
        fromStatus: reservation.unit.status,
        toStatus: "AVAILABLE",
        actorUserId: context.userId,
        reason: "Reserva cancelada",
      });
    }

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "cancel",
      entityType: "Reservation",
      entityId: reservationId,
      beforeData: { status: "ACTIVE" },
      afterData: { status: "CANCELLED", cancelReason },
    });

    return updated;
  });
}
