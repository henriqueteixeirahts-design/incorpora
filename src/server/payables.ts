import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import type { AccessContext } from "@/server/auth-context";
import type { PayableCategory, PayableStatus } from "@/generated/prisma/client";

export function listPayables(organizationId: string, developmentId?: string) {
  return prisma.payable.findMany({
    where: { organizationId, developmentId },
    include: { development: true, spe: true, supplier: true, costCenter: true },
    orderBy: { dueDate: "asc" },
  });
}

export type CreatePayableInput = {
  developmentId?: string;
  speId?: string;
  supplierId?: string;
  costCenterId?: string;
  category: PayableCategory;
  description: string;
  competenceDate: Date;
  dueDate: Date;
  amount: number;
  paymentMethod?: string;
  bankAccount?: string;
  fiscalDocument?: string;
  notes?: string;
};

export async function createPayable(context: AccessContext, input: CreatePayableInput) {
  return prisma.$transaction(async (tx) => {
    const payable = await tx.payable.create({
      data: {
        organizationId: context.organizationId,
        createdByUserId: context.userId,
        ...input,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "Payable",
      entityId: payable.id,
      afterData: payable,
    });

    if (payable.developmentId) {
      await recordDevelopmentEvent(tx, {
        organizationId: context.organizationId,
        developmentId: payable.developmentId,
        actorUserId: context.userId,
        eventType: "payable.created",
        entityType: "Payable",
        entityId: payable.id,
        payload: { amount: Number(payable.amount), category: payable.category },
      });
    }

    return payable;
  });
}

// Fluxo sequencial (PRD seção 16): Lançada → Conferida → Aprovada →
// Programada → Paga → Conciliada. Cancelamento é permitido em qualquer
// etapa antes de paga.
const NEXT_STATUS: Partial<Record<PayableStatus, PayableStatus>> = {
  ENTERED: "REVIEWED",
  REVIEWED: "APPROVED",
  APPROVED: "SCHEDULED",
  SCHEDULED: "PAID",
  PAID: "RECONCILED",
};

export async function advancePayableStatus(context: AccessContext, payableId: string) {
  return prisma.$transaction(async (tx) => {
    const payable = await tx.payable.findFirst({
      where: { id: payableId, organizationId: context.organizationId },
    });
    if (!payable) throw new Error("Conta a pagar inválida.");

    const nextStatus = NEXT_STATUS[payable.status];
    if (!nextStatus) throw new Error("Não há próxima etapa para este status.");

    const updated = await tx.payable.update({
      where: { id: payableId },
      data: {
        status: nextStatus,
        ...(nextStatus === "PAID" ? { paidAt: new Date(), paidAmount: payable.amount } : {}),
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Payable",
      entityId: payableId,
      beforeData: { status: payable.status },
      afterData: { status: nextStatus },
    });

    if (payable.developmentId) {
      await recordDevelopmentEvent(tx, {
        organizationId: context.organizationId,
        developmentId: payable.developmentId,
        actorUserId: context.userId,
        eventType: "payable.status_changed",
        entityType: "Payable",
        entityId: payableId,
        payload: { fromStatus: payable.status, toStatus: nextStatus },
      });
    }

    return updated;
  });
}

export async function cancelPayable(context: AccessContext, payableId: string) {
  return prisma.$transaction(async (tx) => {
    const payable = await tx.payable.findFirst({
      where: { id: payableId, organizationId: context.organizationId },
    });
    if (!payable) throw new Error("Conta a pagar inválida.");
    if (payable.status === "PAID" || payable.status === "RECONCILED") {
      throw new Error("Não é possível cancelar uma conta já paga/conciliada.");
    }

    const updated = await tx.payable.update({
      where: { id: payableId },
      data: { status: "CANCELLED" },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "cancel",
      entityType: "Payable",
      entityId: payableId,
      beforeData: { status: payable.status },
      afterData: { status: "CANCELLED" },
    });

    return updated;
  });
}
