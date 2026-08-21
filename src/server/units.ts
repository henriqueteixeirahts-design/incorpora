import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import type { AccessContext } from "@/server/auth-context";
import { canAccessDevelopment } from "@/server/scope";
import {
  Prisma,
  type UnitType,
  type UnitStatus,
  type UnitLinkType,
  type UnitLinkPricing,
} from "@/generated/prisma/client";

/**
 * `developmentId` fora do escopo do usuário (docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md,
 * Parte 2.5) devolve lista vazia, não erro — mesma convenção de "não
 * encontrado" do isolamento por organização (nunca confirma a existência de
 * dado fora do alcance do usuário).
 */
export function listUnits(context: AccessContext, developmentId: string) {
  if (!canAccessDevelopment(context, developmentId)) return Promise.resolve([]);
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
    if (!development || !canAccessDevelopment(context, development.id)) {
      throw new Error("Empreendimento inválido.");
    }

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

/**
 * Muda o status de uma unidade dentro de uma transação já aberta pelo
 * chamador (reserva, proposta, venda...). Não valida organização — quem
 * chama já deve ter carregado/validado a unidade nessa mesma transação.
 */
export async function changeUnitStatusTx(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    developmentId: string;
    unitId: string;
    fromStatus: UnitStatus;
    toStatus: UnitStatus;
    actorUserId?: string | null;
    reason?: string;
  },
) {
  const updated = await tx.unit.update({
    where: { id: params.unitId },
    data: { status: params.toStatus },
  });

  await tx.unitStatusHistory.create({
    data: {
      unitId: params.unitId,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      changedByUserId: params.actorUserId ?? null,
      reason: params.reason,
    },
  });

  await recordAuditEvent(tx, {
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "update",
    entityType: "Unit",
    entityId: params.unitId,
    beforeData: { status: params.fromStatus },
    afterData: { status: params.toStatus },
  });

  await recordDevelopmentEvent(tx, {
    organizationId: params.organizationId,
    developmentId: params.developmentId,
    actorUserId: params.actorUserId,
    eventType: "unit.status_changed",
    entityType: "Unit",
    entityId: params.unitId,
    payload: { fromStatus: params.fromStatus, toStatus: params.toStatus, reason: params.reason },
  });

  return updated;
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
    if (!unit || !canAccessDevelopment(context, unit.developmentId)) {
      throw new Error("Unidade inválida.");
    }

    return changeUnitStatusTx(tx, {
      organizationId: context.organizationId,
      developmentId: unit.developmentId,
      unitId,
      fromStatus: unit.status,
      toStatus,
      actorUserId: context.userId,
      reason,
    });
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
    if (!canAccessDevelopment(context, principal.developmentId) || !canAccessDevelopment(context, accessory.developmentId)) {
      throw new Error("Unidade inválida.");
    }
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
