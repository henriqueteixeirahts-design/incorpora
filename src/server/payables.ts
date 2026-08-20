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

// Status ainda em algum ponto do fluxo Lançada → Conciliada — usado tanto
// pelo filtro "minhas pendências de aprovação" quanto pra contar o painel.
export const PENDING_APPROVAL_STATUSES: PayableStatus[] = [
  "ENTERED",
  "REVIEWED",
  "APPROVED",
  "SCHEDULED",
  "PAID",
];

export type ListPayablesFilters = {
  search?: string;
  sortBy?: PayableSortField;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  developmentId?: string;
  speId?: string;
  supplierId?: string;
  costCenterId?: string;
  category?: PayableCategory;
  status?: PayableStatus;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  minAmount?: number;
  maxAmount?: number;
  pendingApprovalOnly?: boolean;
};

function payablesWhere(organizationId: string, params: ListPayablesFilters): Prisma.PayableWhereInput {
  const search = params.search?.trim();
  return {
    organizationId,
    ...(search ? { description: { contains: search, mode: "insensitive" } } : {}),
    ...(params.developmentId
      ? {
          OR: [
            { developmentId: params.developmentId, allocations: { none: {} } },
            { allocations: { some: { developmentId: params.developmentId } } },
          ],
        }
      : {}),
    ...(params.speId ? { speId: params.speId } : {}),
    ...(params.supplierId ? { supplierId: params.supplierId } : {}),
    ...(params.costCenterId ? { costCenterId: params.costCenterId } : {}),
    ...(params.category ? { category: params.category } : {}),
    ...(params.pendingApprovalOnly
      ? { status: { in: PENDING_APPROVAL_STATUSES } }
      : params.status
        ? { status: params.status }
        : {}),
    ...(params.dueDateFrom || params.dueDateTo
      ? {
          dueDate: {
            ...(params.dueDateFrom ? { gte: params.dueDateFrom } : {}),
            ...(params.dueDateTo ? { lte: params.dueDateTo } : {}),
          },
        }
      : {}),
    ...(params.minAmount !== undefined || params.maxAmount !== undefined
      ? {
          amount: {
            ...(params.minAmount !== undefined ? { gte: params.minAmount } : {}),
            ...(params.maxAmount !== undefined ? { lte: params.maxAmount } : {}),
          },
        }
      : {}),
  };
}

export async function listPayablesPaged(organizationId: string, params: ListPayablesFilters) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "dueDate";
  const sortDir = params.sortDir ?? "asc";

  const where = payablesWhere(organizationId, params);

  const [items, total] = await Promise.all([
    prisma.payable.findMany({
      where,
      include: {
        development: true,
        spe: true,
        supplier: true,
        costCenter: true,
        allocations: { include: { development: true }, orderBy: { sequence: "asc" } },
      },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payable.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

/** Todos os itens que batem no filtro, sem paginar — pra exportação CSV. */
export function listPayablesForExport(organizationId: string, params: ListPayablesFilters) {
  const where = payablesWhere(organizationId, params);
  const sortBy = params.sortBy ?? "dueDate";
  const sortDir = params.sortDir ?? "asc";
  return prisma.payable.findMany({
    where,
    include: {
      development: true,
      spe: true,
      supplier: true,
      costCenter: true,
      allocations: { include: { development: true }, orderBy: { sequence: "asc" } },
    },
    orderBy: { [sortBy]: sortDir },
  });
}

export function countPendingApproval(organizationId: string) {
  return prisma.payable.count({
    where: { organizationId, status: { in: PENDING_APPROVAL_STATUSES } },
  });
}

export async function getPayableDetail(organizationId: string, payableId: string) {
  const payable = await prisma.payable.findFirst({
    where: { id: payableId, organizationId },
    include: {
      development: true,
      spe: true,
      supplier: true,
      costCenter: true,
      items: { orderBy: { sequence: "asc" } },
      allocations: { include: { development: true }, orderBy: { sequence: "asc" } },
    },
  });
  if (!payable) return null;

  const documents = await prisma.document.findMany({
    where: { organizationId, entityType: ENTITY_TYPE, entityId: payableId },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: true },
  });
  const documentsWithUrl = await Promise.all(
    documents.map(async (doc) => ({
      ...doc,
      uploadedByName: doc.uploadedBy?.fullName ?? null,
      signedUrl: await getSignedDocumentUrl(doc.fileUrl).catch(() => null),
    })),
  );

  const approvalHistory = await getPayableApprovalHistory(organizationId, payableId);

  return { ...payable, documents: documentsWithUrl, approvalHistory };
}

/**
 * "Quem aprovou cada etapa" (spec 4.1) — reaproveita o `AuditEvent` que já é
 * gravado a cada avanço de status (`advancePayableStatus`), em vez de criar
 * uma tabela de aprovações nova: cada conta a pagar só tem um fluxo
 * sequencial linear (não é por alçada como Proposta/Renegociação), então o
 * histórico de "quem mexeu e quando" já é o suficiente.
 */
export async function getPayableApprovalHistory(organizationId: string, payableId: string) {
  const events = await prisma.auditEvent.findMany({
    where: { organizationId, entityType: ENTITY_TYPE, entityId: payableId, action: "update" },
    include: { actor: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  });

  return events
    .filter((event) => {
      const before = event.beforeData as { status?: string } | null;
      const after = event.afterData as { status?: string } | null;
      return before?.status && after?.status && before.status !== after.status;
    })
    .map((event) => {
      const before = event.beforeData as { status: string };
      const after = event.afterData as { status: string };
      return {
        id: event.id,
        fromStatus: before.status,
        toStatus: after.status,
        actorName: event.actor?.fullName ?? "—",
        occurredAt: event.createdAt,
      };
    });
}

export type PayableItemInput = { description: string; amount: number };

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
  items?: PayableItemInput[];
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Itens são um detalhamento opcional — quando presentes, a soma tem que bater exato com o valor total (centavo a centavo). */
function assertItemsMatchAmount(amount: number, items: PayableItemInput[] | undefined) {
  if (!items || items.length === 0) return;
  const sum = round2(items.reduce((acc, item) => acc + item.amount, 0));
  if (sum !== round2(amount)) {
    throw new Error(
      `A soma dos itens (${sum.toFixed(2)}) precisa bater exato com o valor total (${amount.toFixed(2)}).`,
    );
  }
}

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
  const { items, ...data } = input;
  assertItemsMatchAmount(data.amount, items);

  return prisma.$transaction(async (tx) => {
    await assertPayableRelationsOwned(tx, context, data);

    const payable = await tx.payable.create({
      data: {
        organizationId: context.organizationId,
        createdByUserId: context.userId,
        ...data,
        ...(items && items.length > 0
          ? { items: { create: items.map((item, index) => ({ ...item, sequence: index + 1 })) } }
          : {}),
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
  const { items, ...data } = input;
  assertItemsMatchAmount(data.amount, items);

  return prisma.$transaction(async (tx) => {
    const before = await tx.payable.findFirst({
      where: { id: payableId, organizationId: context.organizationId },
    });
    if (!before) throw new Error("Conta a pagar não encontrada.");
    if (before.status !== "ENTERED") {
      throw new Error("Só é possível editar contas com status Lançada.");
    }

    await assertPayableRelationsOwned(tx, context, data);

    await tx.payableItem.deleteMany({ where: { payableId } });
    const payable = await tx.payable.update({
      where: { id: payableId },
      data: {
        ...data,
        ...(items && items.length > 0
          ? { items: { create: items.map((item, index) => ({ ...item, sequence: index + 1 })) } }
          : {}),
      },
    });

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
      include: { commissionSplit: true },
    });
    if (!payable) throw new Error("Conta a pagar inválida.");

    const nextStatus = NEXT_STATUS[payable.status];
    if (!nextStatus) throw new Error("Não há próxima etapa para este status.");

    const paidAt = new Date();
    const updated = await tx.payable.update({
      where: { id: payableId },
      data: {
        status: nextStatus,
        ...(nextStatus === "PAID" ? { paidAt, paidAmount: payable.amount } : {}),
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

    // Conta a pagar de comissão paga (Fase A, Parte 4.2) — completa o ciclo
    // de liberação/pagamento do split sem uma ação separada de "pagar
    // comissão"; a mesma ação que já existe pra qualquer conta a pagar basta.
    if (nextStatus === "PAID" && payable.commissionSplit) {
      await tx.commissionSplit.update({
        where: { id: payable.commissionSplit.id },
        data: { status: "PAID", paidAt },
      });

      await recordAuditEvent(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "CommissionSplit",
        entityId: payable.commissionSplit.id,
        beforeData: { status: payable.commissionSplit.status },
        afterData: { status: "PAID" },
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
