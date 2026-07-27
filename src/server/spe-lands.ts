import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import type { AccessContext } from "@/server/auth-context";
import type { LandAcquisitionMethod } from "@/generated/prisma/client";

export function listSpeLands(speId: string) {
  return prisma.speLand.findMany({ where: { speId }, orderBy: { createdAt: "asc" } });
}

export type CreateSpeLandInput = {
  registrationNumber: string;
  registryOffice: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  totalArea: number;
  municipalRegistration?: string;
  acquisitionMethod?: LandAcquisitionMethod;
  previousOwner?: string;
  acquisitionValue?: number;
  acquisitionDate?: Date;
  affectationEstablished: boolean;
  affectationRegisteredAt?: Date;
  encumbrances?: string;
};

export async function createSpeLand(context: AccessContext, speId: string, input: CreateSpeLandInput) {
  const spe = await prisma.specialPurposeEntity.findFirst({
    where: { id: speId, organizationId: context.organizationId },
  });
  if (!spe) throw new Error("SPE não encontrada.");

  return prisma.$transaction(async (tx) => {
    const land = await tx.speLand.create({ data: { speId, ...input } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "SpeLand",
      entityId: land.id,
      afterData: land,
    });
    return land;
  });
}

export async function updateSpeLand(
  context: AccessContext,
  speId: string,
  landId: string,
  input: CreateSpeLandInput,
) {
  const before = await prisma.speLand.findFirst({ where: { id: landId, speId } });
  if (!before) throw new Error("Terreno não encontrado.");

  return prisma.$transaction(async (tx) => {
    const land = await tx.speLand.update({ where: { id: landId }, data: input });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "SpeLand",
      entityId: land.id,
      beforeData: before,
      afterData: land,
    });
    return land;
  });
}

export async function deleteSpeLand(context: AccessContext, speId: string, landId: string) {
  const land = await prisma.speLand.findFirst({ where: { id: landId, speId } });
  if (!land) throw new Error("Terreno não encontrado.");

  return prisma.$transaction(async (tx) => {
    await tx.speLand.delete({ where: { id: landId } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: "SpeLand",
      entityId: landId,
      beforeData: land,
    });
  });
}
