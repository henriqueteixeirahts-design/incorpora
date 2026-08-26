import "server-only";

import { prisma, type TransactionClient } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import type { AccessContext } from "@/server/auth-context";
import { canAccessDevelopment } from "@/server/scope";
import type { ReceivableCategory, ReceivableStatus, Prisma } from "@/generated/prisma/client";

/**
 * Escopo por empreendimento pra Receivable (docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md,
 * Parte 2.5) — `developmentId` é opcional (recebível "da organização"), então
 * não dá pra usar `developmentAccessScope` genérico (ele excluiria os
 * registros sem empreendimento). Visível se sem `developmentId` (nível
 * organização, sempre visível) OU se o `developmentId` está no escopo.
 */
function receivableDevelopmentAccessWhere(context: AccessContext): Prisma.ReceivableWhereInput {
  if (context.developmentAccess === "ALL") return {};
  return { OR: [{ developmentId: null }, { developmentId: { in: [...context.developmentAccess] } }] };
}

const ENTITY_TYPE = "Receivable";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type ReceivableSortField = "dueDate" | "amount" | "origin" | "status";

export type ListReceivablesFilters = {
  search?: string;
  sortBy?: ReceivableSortField;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  developmentId?: string;
  speId?: string;
  customerId?: string;
  category?: ReceivableCategory;
  status?: ReceivableStatus;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  minAmount?: number;
  maxAmount?: number;
};

function receivablesWhere(context: AccessContext, params: ListReceivablesFilters): Prisma.ReceivableWhereInput {
  const search = params.search?.trim();
  return {
    organizationId: context.organizationId,
    ...receivableDevelopmentAccessWhere(context),
    ...(search ? { origin: { contains: search, mode: "insensitive" } } : {}),
    ...(params.developmentId ? { developmentId: params.developmentId } : {}),
    ...(params.speId ? { speId: params.speId } : {}),
    ...(params.customerId ? { customerId: params.customerId } : {}),
    ...(params.category ? { category: params.category } : {}),
    ...(params.status ? { status: params.status } : {}),
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

const INCLUDE = { development: true, spe: true, customer: true } satisfies Prisma.ReceivableInclude;

export async function listReceivablesPaged(context: AccessContext, params: ListReceivablesFilters) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "dueDate";
  const sortDir = params.sortDir ?? "asc";
  const where = receivablesWhere(context, params);

  const [items, total] = await Promise.all([
    prisma.receivable.findMany({
      where,
      include: INCLUDE,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.receivable.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export function listReceivablesForExport(context: AccessContext, params: ListReceivablesFilters) {
  const where = receivablesWhere(context, params);
  const sortBy = params.sortBy ?? "dueDate";
  const sortDir = params.sortDir ?? "asc";
  return prisma.receivable.findMany({ where, include: INCLUDE, orderBy: { [sortBy]: sortDir } });
}

export async function getReceivableDetail(context: AccessContext, receivableId: string) {
  const receivable = await prisma.receivable.findFirst({
    where: { id: receivableId, organizationId: context.organizationId },
    include: INCLUDE,
  });
  if (!receivable || !canAccessDevelopment(context, receivable.developmentId)) return null;
  return receivable;
}

export type CreateReceivableInput = {
  developmentId?: string;
  speId?: string;
  customerId?: string;
  category: ReceivableCategory;
  origin: string;
  dueDate: Date;
  amount: number;
  notes?: string;
};

async function assertReceivableRelationsOwned(
  tx: TransactionClient,
  context: AccessContext,
  input: CreateReceivableInput,
) {
  if (input.developmentId) {
    const development = await tx.development.findFirst({
      where: { id: input.developmentId, organizationId: context.organizationId },
    });
    if (!development || !canAccessDevelopment(context, development.id)) {
      throw new Error("Empreendimento inválido.");
    }
  }
  if (input.speId) {
    const spe = await tx.specialPurposeEntity.findFirst({
      where: { id: input.speId, organizationId: context.organizationId },
    });
    if (!spe) throw new Error("SPE inválida.");
  }
  if (input.customerId) {
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, organizationId: context.organizationId },
    });
    if (!customer) throw new Error("Cliente/pagador inválido.");
  }
}

export async function createReceivable(context: AccessContext, input: CreateReceivableInput) {
  return prisma.$transaction(async (tx) => {
    await assertReceivableRelationsOwned(tx, context, input);

    const receivable = await tx.receivable.create({
      data: { organizationId: context.organizationId, createdByUserId: context.userId, ...input },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: ENTITY_TYPE,
      entityId: receivable.id,
      afterData: receivable,
    });

    if (receivable.developmentId) {
      await recordDevelopmentEvent(tx, {
        organizationId: context.organizationId,
        developmentId: receivable.developmentId,
        actorUserId: context.userId,
        eventType: "receivable.created",
        entityType: ENTITY_TYPE,
        entityId: receivable.id,
        payload: { amount: Number(receivable.amount), category: receivable.category },
      });
    }

    return receivable;
  });
}

export type UpdateReceivableInput = CreateReceivableInput;

/** Edição só é permitida enquanto pendente — mesma regra já usada em Payable/PayableItem. */
export async function updateReceivable(context: AccessContext, receivableId: string, input: UpdateReceivableInput) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.receivable.findFirst({
      where: { id: receivableId, organizationId: context.organizationId },
    });
    if (!before || !canAccessDevelopment(context, before.developmentId)) throw new Error("Recebível não encontrado.");
    if (before.status !== "PENDING") throw new Error("Só é possível editar recebíveis pendentes.");

    await assertReceivableRelationsOwned(tx, context, input);

    const receivable = await tx.receivable.update({ where: { id: receivableId }, data: input });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: receivable.id,
      beforeData: before,
      afterData: receivable,
    });

    return receivable;
  });
}

export async function registerReceivableReceipt(
  context: AccessContext,
  receivableId: string,
  input: { receivedAt?: Date; receivedAmount?: number } = {},
) {
  return prisma.$transaction(async (tx) => {
    const receivable = await tx.receivable.findFirst({
      where: { id: receivableId, organizationId: context.organizationId },
    });
    if (!receivable || !canAccessDevelopment(context, receivable.developmentId)) throw new Error("Recebível não encontrado.");
    if (receivable.status !== "PENDING") throw new Error("Este recebível já foi baixado ou cancelado.");

    const receivedAt = input.receivedAt ?? new Date();
    const receivedAmount = input.receivedAmount ?? Number(receivable.amount);

    const updated = await tx.receivable.update({
      where: { id: receivableId },
      data: { status: "RECEIVED", receivedAt, receivedAmount },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: receivableId,
      beforeData: { status: receivable.status },
      afterData: { status: "RECEIVED", receivedAt, receivedAmount },
    });

    return updated;
  });
}

export async function cancelReceivable(context: AccessContext, receivableId: string) {
  return prisma.$transaction(async (tx) => {
    const receivable = await tx.receivable.findFirst({
      where: { id: receivableId, organizationId: context.organizationId },
    });
    if (!receivable || !canAccessDevelopment(context, receivable.developmentId)) throw new Error("Recebível não encontrado.");
    if (receivable.status === "RECEIVED") throw new Error("Não é possível cancelar um recebível já baixado.");

    const updated = await tx.receivable.update({ where: { id: receivableId }, data: { status: "CANCELLED" } });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "cancel",
      entityType: ENTITY_TYPE,
      entityId: receivableId,
      beforeData: { status: receivable.status },
      afterData: { status: "CANCELLED" },
    });

    return updated;
  });
}

/**
 * Cria o recebível avulso automático da taxa de cessão (Fase A, cessão de
 * direitos) — chamada de dentro da transação de `signAssignment`, nunca
 * exposta como action separada. Substitui a antiga criação de `Installment`
 * na carteira do imóvel (pendência registrada desde a Fase A etapa 5: a taxa
 * não é receita da venda, é um evento financeiro à parte, e misturada na
 * carteira ela acumulava juros/multa contratuais como se fosse parcela de
 * venda — o que a spec 4.3 explicitamente veta: "não mistura com o motor de
 * correção").
 */
export async function createAssignmentFeeReceivable(
  tx: TransactionClient,
  params: {
    organizationId: string;
    developmentId: string | null;
    speId: string | null;
    customerId: string;
    origin: string;
    dueDate: Date;
    amount: number;
    contractAssignmentId: string;
    actorUserId: string | null;
  },
) {
  const receivable = await tx.receivable.create({
    data: {
      organizationId: params.organizationId,
      developmentId: params.developmentId,
      speId: params.speId,
      customerId: params.customerId,
      category: "ASSIGNMENT_FEE",
      origin: params.origin,
      dueDate: params.dueDate,
      amount: round2(params.amount),
      contractAssignmentId: params.contractAssignmentId,
      createdByUserId: params.actorUserId,
    },
  });

  await recordAuditEvent(tx, {
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "create",
    entityType: ENTITY_TYPE,
    entityId: receivable.id,
    afterData: receivable,
  });

  return receivable;
}
