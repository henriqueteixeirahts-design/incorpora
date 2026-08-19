import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import type { AccessContext } from "@/server/auth-context";
import type { DevelopmentType, Prisma } from "@/generated/prisma/client";

export function listDevelopments(organizationId: string) {
  return prisma.development.findMany({
    where: { organizationId },
    include: { spe: true, _count: { select: { units: true } } },
    orderBy: { name: "asc" },
  });
}

export type DevelopmentSortField = "name" | "type" | "city" | "createdAt";

export async function listDevelopmentsPaged(
  organizationId: string,
  params: { search?: string; sortBy?: DevelopmentSortField; sortDir?: "asc" | "desc"; page?: number; pageSize?: number },
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "name";
  const sortDir = params.sortDir ?? "asc";
  const search = params.search?.trim();

  const where: Prisma.DevelopmentWhereInput = {
    organizationId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { city: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.development.findMany({
      where,
      include: { spe: true, _count: { select: { units: true } } },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.development.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getDevelopment(organizationId: string, developmentId: string) {
  const development = await prisma.development.findFirst({
    where: { id: developmentId, organizationId },
    include: {
      spe: true,
      postHabiteSeIndexRule: true,
      buildings: { include: { floors: true }, orderBy: { name: "asc" } },
    },
  });
  if (!development) return null;

  const auditTrail = await prisma.auditEvent.findMany({
    where: { organizationId, entityType: "Development", entityId: developmentId },
    orderBy: { createdAt: "asc" },
    include: { actor: true },
  });
  const createdEvent = auditTrail[0] ?? null;
  const updatedEvent = auditTrail[auditTrail.length - 1] ?? null;

  return {
    ...development,
    audit: {
      createdByName: createdEvent?.actor?.fullName ?? null,
      createdAt: createdEvent?.createdAt ?? development.createdAt,
      updatedByName: updatedEvent?.actor?.fullName ?? null,
      updatedAt: updatedEvent?.createdAt ?? development.updatedAt,
    },
  };
}

export type CreateDevelopmentInput = {
  speId: string;
  name: string;
  type: DevelopmentType;
  city?: string;
  state?: string;
  address?: string;
};

export async function createDevelopment(
  context: AccessContext,
  input: CreateDevelopmentInput,
) {
  return prisma.$transaction(async (tx) => {
    const spe = await tx.specialPurposeEntity.findFirst({
      where: { id: input.speId, organizationId: context.organizationId },
    });
    if (!spe) throw new Error("SPE inválida.");

    const development = await tx.development.create({
      data: {
        organizationId: context.organizationId,
        speId: input.speId,
        name: input.name,
        type: input.type,
        city: input.city,
        state: input.state,
        address: input.address,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "Development",
      entityId: development.id,
      afterData: development,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: development.id,
      actorUserId: context.userId,
      eventType: "development.created",
      entityType: "Development",
      entityId: development.id,
      payload: { name: development.name, type: development.type },
    });

    return development;
  });
}

export async function updateDevelopment(
  context: AccessContext,
  developmentId: string,
  input: CreateDevelopmentInput,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.development.findFirst({
      where: { id: developmentId, organizationId: context.organizationId },
    });
    if (!before) throw new Error("Empreendimento não encontrado.");

    const spe = await tx.specialPurposeEntity.findFirst({
      where: { id: input.speId, organizationId: context.organizationId },
    });
    if (!spe) throw new Error("SPE inválida.");

    const development = await tx.development.update({
      where: { id: developmentId },
      data: {
        speId: input.speId,
        name: input.name,
        type: input.type,
        city: input.city,
        state: input.state,
        address: input.address,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Development",
      entityId: development.id,
      beforeData: before,
      afterData: development,
    });

    return development;
  });
}

export async function deleteDevelopment(context: AccessContext, developmentId: string) {
  const development = await prisma.development.findFirst({
    where: { id: developmentId, organizationId: context.organizationId },
  });
  if (!development) throw new Error("Empreendimento não encontrado.");

  const [units, costCenters, payables, payableAllocations] = await Promise.all([
    prisma.unit.count({ where: { developmentId } }),
    prisma.costCenter.count({ where: { developmentId } }),
    prisma.payable.count({ where: { developmentId } }),
    prisma.payableAllocation.count({ where: { developmentId } }),
  ]);
  const totalLinks = units + costCenters + payables + payableAllocations;
  if (totalLinks > 0) {
    throw new Error(
      `Não é possível excluir: o empreendimento tem ${totalLinks} registro(s) vinculado(s) (unidades, centros de custo, contas a pagar ou rateios de despesa).`,
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.development.delete({ where: { id: developmentId } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: "Development",
      entityId: developmentId,
      beforeData: development,
    });
  });
}

export async function createBuilding(
  context: AccessContext,
  developmentId: string,
  name: string,
) {
  return prisma.$transaction(async (tx) => {
    const development = await tx.development.findFirst({
      where: { id: developmentId, organizationId: context.organizationId },
    });
    if (!development) throw new Error("Empreendimento inválido.");

    const building = await tx.building.create({ data: { developmentId, name } });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "Building",
      entityId: building.id,
      afterData: building,
    });

    return building;
  });
}

export async function createFloor(
  context: AccessContext,
  buildingId: string,
  level: number,
  label?: string,
) {
  return prisma.$transaction(async (tx) => {
    const building = await tx.building.findFirst({
      where: { id: buildingId, development: { organizationId: context.organizationId } },
    });
    if (!building) throw new Error("Torre/bloco inválido.");

    const floor = await tx.floor.create({ data: { buildingId, level, label } });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "Floor",
      entityId: floor.id,
      afterData: floor,
    });

    return floor;
  });
}
