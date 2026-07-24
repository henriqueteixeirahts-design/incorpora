import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import type { AccessContext } from "@/server/auth-context";
import {
  type UnitType,
  type UnitStatus,
  type UnitLinkType,
  type UnitLinkPricing,
} from "@/generated/prisma/client";

export function listUnits(developmentId: string) {
  return prisma.unit.findMany({
    where: { developmentId },
    include: {
      building: true,
      floor: true,
      linksAsPrincipal: { include: { accessoryUnit: true } },
    },
    orderBy: [{ isAccessory: "asc" }, { number: "asc" }],
  });
}

export type CreateUnitInput = {
  developmentId: string;
  buildingId?: string;
  floorId?: string;
  unitType: UnitType;
  isAccessory?: boolean;
  number: string;
  bedrooms?: number;
  suites?: number;
  privateArea?: number;
  totalArea?: number;
  block?: string;
  lotArea?: number;
  frontage?: number;
  depth?: number;
  registrationNumber?: string;
  referenceValue?: number;
  notes?: string;
};

export async function createUnit(context: AccessContext, input: CreateUnitInput) {
  return prisma.$transaction(async (tx) => {
    const development = await tx.development.findFirst({
      where: { id: input.developmentId, organizationId: context.organizationId },
    });
    if (!development) throw new Error("Empreendimento inválido.");

    const unit = await tx.unit.create({
      data: {
        developmentId: input.developmentId,
        buildingId: input.buildingId,
        floorId: input.floorId,
        unitType: input.unitType,
        isAccessory: input.isAccessory ?? false,
        number: input.number,
        bedrooms: input.bedrooms,
        suites: input.suites,
        privateArea: input.privateArea,
        totalArea: input.totalArea,
        block: input.block,
        lotArea: input.lotArea,
        frontage: input.frontage,
        depth: input.depth,
        registrationNumber: input.registrationNumber,
        referenceValue: input.referenceValue,
        notes: input.notes,
      },
    });

    await tx.unitStatusHistory.create({
      data: {
        unitId: unit.id,
        toStatus: unit.status,
        changedByUserId: context.userId,
        reason: "Cadastro inicial",
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "Unit",
      entityId: unit.id,
      afterData: unit,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: input.developmentId,
      actorUserId: context.userId,
      eventType: "unit.created",
      entityType: "Unit",
      entityId: unit.id,
      payload: { number: unit.number, unitType: unit.unitType },
    });

    return unit;
  });
}

export async function updateUnitStatus(
  context: AccessContext,
  unitId: string,
  toStatus: UnitStatus,
  reason?: string,
) {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findFirst({
      where: { id: unitId, development: { organizationId: context.organizationId } },
    });
    if (!unit) throw new Error("Unidade inválida.");

    const fromStatus = unit.status;

    const updated = await tx.unit.update({
      where: { id: unitId },
      data: { status: toStatus },
    });

    await tx.unitStatusHistory.create({
      data: {
        unitId,
        fromStatus,
        toStatus,
        changedByUserId: context.userId,
        reason,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Unit",
      entityId: unitId,
      beforeData: { status: fromStatus },
      afterData: { status: toStatus },
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: unit.developmentId,
      actorUserId: context.userId,
      eventType: "unit.status_changed",
      entityType: "Unit",
      entityId: unitId,
      payload: { fromStatus, toStatus, reason },
    });

    return updated;
  });
}

export async function linkUnits(
  context: AccessContext,
  principalUnitId: string,
  accessoryUnitId: string,
  linkType: UnitLinkType,
  pricing: UnitLinkPricing,
) {
  return prisma.$transaction(async (tx) => {
    const [principal, accessory] = await Promise.all([
      tx.unit.findFirst({
        where: { id: principalUnitId, development: { organizationId: context.organizationId } },
      }),
      tx.unit.findFirst({
        where: { id: accessoryUnitId, development: { organizationId: context.organizationId } },
      }),
    ]);
    if (!principal || !accessory) throw new Error("Unidade inválida.");
    if (!accessory.isAccessory) throw new Error("A unidade vinculada precisa ser acessória.");
    if (principal.developmentId !== accessory.developmentId) {
      throw new Error("As unidades precisam pertencer ao mesmo empreendimento.");
    }

    const link = await tx.unitLink.create({
      data: { principalUnitId, accessoryUnitId, linkType, pricing },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "UnitLink",
      entityId: link.id,
      afterData: link,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: principal.developmentId,
      actorUserId: context.userId,
      eventType: "unit.linked",
      entityType: "UnitLink",
      entityId: link.id,
      payload: { principalUnitId, accessoryUnitId, linkType, pricing },
    });

    return link;
  });
}
