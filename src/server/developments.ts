import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import type { AccessContext } from "@/server/auth-context";
import type { DevelopmentType } from "@/generated/prisma/client";

export function listDevelopments(organizationId: string) {
  return prisma.development.findMany({
    where: { organizationId },
    include: { spe: true, _count: { select: { units: true } } },
    orderBy: { name: "asc" },
  });
}

export function getDevelopment(organizationId: string, developmentId: string) {
  return prisma.development.findFirst({
    where: { id: developmentId, organizationId },
    include: {
      spe: true,
      postHabiteSeIndexRule: true,
      buildings: { include: { floors: true }, orderBy: { name: "asc" } },
    },
  });
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
