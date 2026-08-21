import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent, getAuditSummaries } from "@/lib/audit";
import { canAccessDevelopment } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";
import type { Prisma } from "@/generated/prisma/client";

export type SupplierSortField = "name" | "document" | "createdAt";

export function listSuppliers(organizationId: string) {
  return prisma.supplier.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function listSuppliersPaged(
  organizationId: string,
  params: { search?: string; sortBy?: SupplierSortField; sortDir?: "asc" | "desc"; page?: number; pageSize?: number },
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "name";
  const sortDir = params.sortDir ?? "asc";
  const search = params.search?.trim();

  const where: Prisma.SupplierWhereInput = {
    organizationId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { document: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.supplier.count({ where }),
  ]);

  const audit = await getAuditSummaries(
    organizationId,
    "Supplier",
    items.map((i) => i.id),
    new Map(items.map((i) => [i.id, { createdAt: i.createdAt, updatedAt: i.createdAt }])),
  );

  return { items: items.map((item) => ({ ...item, audit: audit.get(item.id)! })), total, page, pageSize };
}

export type CreateSupplierInput = {
  name: string;
  document?: string;
  email?: string;
  phone?: string;
};

export async function createSupplier(context: AccessContext, input: CreateSupplierInput) {
  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({
      data: { organizationId: context.organizationId, ...input },
    });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "Supplier",
      entityId: supplier.id,
      afterData: supplier,
    });
    return supplier;
  });
}

export async function updateSupplier(
  context: AccessContext,
  supplierId: string,
  input: CreateSupplierInput,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.supplier.findFirst({
      where: { id: supplierId, organizationId: context.organizationId },
    });
    if (!before) throw new Error("Fornecedor não encontrado.");

    const supplier = await tx.supplier.update({ where: { id: supplierId }, data: input });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Supplier",
      entityId: supplier.id,
      beforeData: before,
      afterData: supplier,
    });
    return supplier;
  });
}

export async function deleteSupplier(context: AccessContext, supplierId: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, organizationId: context.organizationId },
  });
  if (!supplier) throw new Error("Fornecedor não encontrado.");

  const payablesCount = await prisma.payable.count({ where: { supplierId } });
  if (payablesCount > 0) {
    throw new Error(`Não é possível excluir: o fornecedor tem ${payablesCount} conta(s) a pagar vinculada(s).`);
  }

  return prisma.$transaction(async (tx) => {
    await tx.supplier.delete({ where: { id: supplierId } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: "Supplier",
      entityId: supplierId,
      beforeData: supplier,
    });
  });
}

export type CostCenterSortField = "name" | "createdAt";

/**
 * Centro de custo tem `developmentId` opcional (docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md,
 * Parte 2.5): os "da organização" (`developmentId: null`) não são
 * restringíveis por empreendimento — só os vinculados a um empreendimento
 * específico, e só quando fora do `developmentAccess` do usuário.
 */
function costCenterDevelopmentScope(context: AccessContext): Prisma.CostCenterWhereInput {
  if (context.developmentAccess === "ALL") return {};
  return { OR: [{ developmentId: null }, { developmentId: { in: [...context.developmentAccess] } }] };
}

export function listCostCenters(context: AccessContext) {
  return prisma.costCenter.findMany({
    where: { organizationId: context.organizationId, ...costCenterDevelopmentScope(context) },
    include: { development: true },
    orderBy: { name: "asc" },
  });
}

export async function listCostCentersPaged(
  context: AccessContext,
  params: { search?: string; sortBy?: CostCenterSortField; sortDir?: "asc" | "desc"; page?: number; pageSize?: number },
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "name";
  const sortDir = params.sortDir ?? "asc";
  const search = params.search?.trim();

  const where: Prisma.CostCenterWhereInput = {
    organizationId: context.organizationId,
    ...costCenterDevelopmentScope(context),
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.costCenter.findMany({
      where,
      include: { development: true },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.costCenter.count({ where }),
  ]);

  const audit = await getAuditSummaries(
    context.organizationId,
    "CostCenter",
    items.map((i) => i.id),
    new Map(items.map((i) => [i.id, { createdAt: i.createdAt, updatedAt: i.createdAt }])),
  );

  return { items: items.map((item) => ({ ...item, audit: audit.get(item.id)! })), total, page, pageSize };
}

export type CreateCostCenterInput = {
  name: string;
  developmentId?: string;
};

async function assertDevelopmentOwned(tx: Prisma.TransactionClient, context: AccessContext, developmentId?: string) {
  if (!developmentId) return;
  const development = await tx.development.findFirst({
    where: { id: developmentId, organizationId: context.organizationId },
  });
  if (!development || !canAccessDevelopment(context, developmentId)) {
    throw new Error("Empreendimento inválido.");
  }
}

export async function createCostCenter(context: AccessContext, input: CreateCostCenterInput) {
  return prisma.$transaction(async (tx) => {
    await assertDevelopmentOwned(tx, context, input.developmentId);

    const costCenter = await tx.costCenter.create({
      data: { organizationId: context.organizationId, ...input },
    });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "CostCenter",
      entityId: costCenter.id,
      afterData: costCenter,
    });
    return costCenter;
  });
}

export async function updateCostCenter(
  context: AccessContext,
  costCenterId: string,
  input: CreateCostCenterInput,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.costCenter.findFirst({
      where: { id: costCenterId, organizationId: context.organizationId },
    });
    if (!before || !canAccessDevelopment(context, before.developmentId)) {
      throw new Error("Centro de custo não encontrado.");
    }

    await assertDevelopmentOwned(tx, context, input.developmentId);

    const costCenter = await tx.costCenter.update({ where: { id: costCenterId }, data: input });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "CostCenter",
      entityId: costCenter.id,
      beforeData: before,
      afterData: costCenter,
    });
    return costCenter;
  });
}

export async function deleteCostCenter(context: AccessContext, costCenterId: string) {
  const costCenter = await prisma.costCenter.findFirst({
    where: { id: costCenterId, organizationId: context.organizationId },
  });
  if (!costCenter || !canAccessDevelopment(context, costCenter.developmentId)) {
    throw new Error("Centro de custo não encontrado.");
  }

  const payablesCount = await prisma.payable.count({ where: { costCenterId } });
  if (payablesCount > 0) {
    throw new Error(`Não é possível excluir: o centro de custo tem ${payablesCount} conta(s) a pagar vinculada(s).`);
  }

  return prisma.$transaction(async (tx) => {
    await tx.costCenter.delete({ where: { id: costCenterId } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: "CostCenter",
      entityId: costCenterId,
      beforeData: costCenter,
    });
  });
}
