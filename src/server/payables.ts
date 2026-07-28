import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import {
  getSignedDocumentUrl,
  uploadEntityDocument,
  deleteEntityDocumentFile,
} from "@/server/storage";
import type { AccessContext } from "@/server/auth-context";
import type { PayableCategory, PayableStatus, DocumentCategory, Prisma } from "@/generated/prisma/client";

const ENTITY_TYPE = "Payable";

export function listPayables(organizationId: string, developmentId?: string) {
  return prisma.payable.findMany({
    where: { organizationId, developmentId },
    include: { development: true, spe: true, supplier: true, costCenter: true },
    orderBy: { dueDate: "asc" },
  });
}

export type PayableSortField = "dueDate" | "amount" | "description" | "status";

export async function listPayablesPaged(
  organizationId: string,
  params: { search?: string; sortBy?: PayableSortField; sortDir?: "asc" | "desc"; page?: number; pageSize?: number },
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "dueDate";
  const sortDir = params.sortDir ?? "asc";
  const search = params.search?.trim();

  const where: Prisma.PayableWhereInput = {
    organizationId,
    ...(search ? { description: { contains: search, mode: "insensitive" } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.payable.findMany({
      where,
      include: { development: true, spe: true, supplier: true, costCenter: true },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payable.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getPayableDetail(organizationId: string, payableId: string) {
  const payable = await prisma.payable.findFirst({
    where: { id: payableId, organizationId },
    include: { development: true, spe: true, supplier: true, costCenter: true },
  });
  if (!payable) return null;

  const documents = await prisma.document.findMany({
    where: { organizationId, entityType: ENTITY_TYPE, entityId: payableId },
    orderBy: { createdAt: "desc" },
  });
  const documentsWithUrl = await Promise.all(
    documents.map(async (doc) => ({
      ...doc,
      signedUrl: await getSignedDocumentUrl(doc.fileUrl).catch(() => null),
    })),
  );

  return { ...payable, documents: documentsWithUrl };
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

async function assertPayableRelationsOwned(
  tx: Prisma.TransactionClient,
  context: AccessContext,
  input: CreatePayableInput,
) {
  if (input.developmentId) {
    const development = await tx.development.findFirst({
      where: { id: input.developmentId, organizationId: context.organizationId },
    });
    if (!development) throw new Error("Empreendimento inválido.");
  }
  if (input.speId) {
    const spe = await tx.specialPurposeEntity.findFirst({
      where: { id: input.speId, organizationId: context.organizationId },
    });
    if (!spe) throw new Error("SPE inválida.");
  }
  if (input.supplierId) {
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, organizationId: context.organizationId },
    });
    if (!supplier) throw new Error("Fornecedor inválido.");
  }
  if (input.costCenterId) {
    const costCenter = await tx.costCenter.findFirst({
      where: { id: input.costCenterId, organizationId: context.organizationId },
    });
    if (!costCenter) throw new Error("Centro de custo inválido.");
  }
}

export async function createPayable(context: AccessContext, input: CreatePayableInput) {
  return prisma.$transaction(async (tx) => {
    await assertPayableRelationsOwned(tx, context, input);

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

export type UpdatePayableInput = CreatePayableInput;

/**
 * Edição de dados só é permitida enquanto a conta está "Lançada" (ENTERED) —
 * uma vez conferida/aprovada, os valores viram parte de um fluxo auditável e
 * não devem mudar silenciosamente; para corrigir depois disso, cancele e
 * lance de novo.
 */
export async function updatePayable(
  context: AccessContext,
  payableId: string,
  input: UpdatePayableInput,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.payable.findFirst({
      where: { id: payableId, organizationId: context.organizationId },
    });
    if (!before) throw new Error("Conta a pagar não encontrada.");
    if (before.status !== "ENTERED") {
      throw new Error("Só é possível editar contas com status Lançada.");
    }

    await assertPayableRelationsOwned(tx, context, input);

    const payable = await tx.payable.update({ where: { id: payableId }, data: input });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Payable",
      entityId: payable.id,
      beforeData: before,
      afterData: payable,
    });

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

export async function uploadPayableDocument(
  context: AccessContext,
  payableId: string,
  file: File,
  category: DocumentCategory,
) {
  const payable = await prisma.payable.findFirst({
    where: { id: payableId, organizationId: context.organizationId },
  });
  if (!payable) throw new Error("Conta a pagar não encontrada.");

  const path = await uploadEntityDocument(file, ENTITY_TYPE, payableId);

  return prisma.document.create({
    data: {
      organizationId: context.organizationId,
      entityType: ENTITY_TYPE,
      entityId: payableId,
      category,
      fileName: file.name,
      fileUrl: path,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedById: context.userId,
    },
  });
}

export async function deletePayableDocument(context: AccessContext, documentId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId: context.organizationId, entityType: ENTITY_TYPE },
  });
  if (!document) throw new Error("Anexo não encontrado.");

  await prisma.document.delete({ where: { id: documentId } });
  await deleteEntityDocumentFile(document.fileUrl);
}
