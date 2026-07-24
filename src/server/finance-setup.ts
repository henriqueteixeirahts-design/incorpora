import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import type { AccessContext } from "@/server/auth-context";

export function listSuppliers(organizationId: string) {
  return prisma.supplier.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function createSupplier(
  context: AccessContext,
  input: { name: string; document?: string; email?: string; phone?: string },
) {
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

export function listCostCenters(organizationId: string) {
  return prisma.costCenter.findMany({
    where: { organizationId },
    include: { development: true },
    orderBy: { name: "asc" },
  });
}

export async function createCostCenter(
  context: AccessContext,
  input: { name: string; developmentId?: string },
) {
  return prisma.$transaction(async (tx) => {
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
