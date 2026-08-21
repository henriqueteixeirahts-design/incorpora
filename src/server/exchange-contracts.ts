import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { developmentOwnedScope, orgScope, canAccessDevelopment } from "@/server/scope";
import { changeUnitStatusTx } from "@/server/units";
import { uploadEntityDocument, getSignedDocumentUrl, deleteEntityDocumentFile } from "@/server/storage";
import type { AccessContext } from "@/server/auth-context";
import type { ExchangeContractType, ExchangeContractStatus } from "@/generated/prisma/client";

const ENTITY_TYPE = "ExchangeContract";

/** Status que já saíram do "disponível para negociação" — destaque/gestão não mexe mais neles. */
const LOCKED_UNIT_STATUSES = ["SOLD", "CONTRACT_IN_PROGRESS", "AWAITING_SIGNATURE", "CANCELLED"] as const;

export async function listExchangeContracts(context: AccessContext, developmentId: string) {
  const development = await prisma.development.findFirst({
    where: { id: developmentId, ...orgScope(context) },
  });
  if (!development || !canAccessDevelopment(context, developmentId)) {
    throw new Error("Empreendimento não encontrado.");
  }

  return prisma.exchangeContract.findMany({
    where: { developmentId },
    include: { permutante: true, lands: { include: { land: true } }, units: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getExchangeContractDetail(context: AccessContext, contractId: string) {
  const contract = await prisma.exchangeContract.findFirst({
    where: { id: contractId, ...developmentOwnedScope(context) },
    include: { permutante: true, lands: { include: { land: true } }, units: true, development: true },
  });
  if (!contract || !canAccessDevelopment(context, contract.developmentId)) return null;

  const signedUrl = contract.contractDocumentPath
    ? await getSignedDocumentUrl(contract.contractDocumentPath).catch(() => null)
    : null;

  return { ...contract, contractDocumentSignedUrl: signedUrl };
}

export type CreateExchangeContractInput = {
  developmentId: string;
  permutanteId: string;
  type: ExchangeContractType;
  appraisalValue?: number;
  contractDate: Date;
  notes?: string;
  status?: ExchangeContractStatus;
  managedBySystem?: boolean;
  administrationFeePct?: number;
  landIds: string[];
};

async function assertLandsBelongToDevelopmentSpe(developmentId: string, landIds: string[]) {
  if (landIds.length === 0) return;
  const development = await prisma.development.findUniqueOrThrow({ where: { id: developmentId } });
  const count = await prisma.speLand.count({ where: { id: { in: landIds }, speId: development.speId } });
  if (count !== landIds.length) throw new Error("Terreno inválido para este empreendimento.");
}

export async function createExchangeContract(context: AccessContext, input: CreateExchangeContractInput) {
  const development = await prisma.development.findFirst({
    where: { id: input.developmentId, organizationId: context.organizationId },
  });
  if (!development || !canAccessDevelopment(context, input.developmentId)) {
    throw new Error("Empreendimento não encontrado.");
  }

  const permutante = await prisma.permutante.findFirst({
    where: { id: input.permutanteId, organizationId: context.organizationId },
  });
  if (!permutante) throw new Error("Permutante não encontrado.");

  await assertLandsBelongToDevelopmentSpe(input.developmentId, input.landIds);

  return prisma.$transaction(async (tx) => {
    const contract = await tx.exchangeContract.create({
      data: {
        developmentId: input.developmentId,
        permutanteId: input.permutanteId,
        type: input.type,
        appraisalValue: input.appraisalValue,
        contractDate: input.contractDate,
        notes: input.notes,
        status: input.status ?? "ACTIVE",
        managedBySystem: input.type === "FINANCIAL" ? null : (input.managedBySystem ?? true),
        administrationFeePct: input.administrationFeePct,
        lands: { create: input.landIds.map((landId) => ({ landId })) },
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: ENTITY_TYPE,
      entityId: contract.id,
      afterData: contract,
    });

    return contract;
  });
}

export type UpdateExchangeContractInput = Omit<CreateExchangeContractInput, "developmentId">;

export async function updateExchangeContract(
  context: AccessContext,
  contractId: string,
  input: UpdateExchangeContractInput,
) {
  const before = await prisma.exchangeContract.findFirst({
    where: { id: contractId, ...developmentOwnedScope(context) },
    include: { units: true },
  });
  if (!before || !canAccessDevelopment(context, before.developmentId)) {
    throw new Error("Contrato de permuta não encontrado.");
  }

  const permutante = await prisma.permutante.findFirst({
    where: { id: input.permutanteId, organizationId: context.organizationId },
  });
  if (!permutante) throw new Error("Permutante não encontrado.");

  await assertLandsBelongToDevelopmentSpe(before.developmentId, input.landIds);

  const nextManagedBySystem = input.type === "FINANCIAL" ? null : (input.managedBySystem ?? true);
  const managedBySystemChanged =
    (input.type === "PHYSICAL" || input.type === "MIXED") && before.managedBySystem !== nextManagedBySystem;

  return prisma.$transaction(async (tx) => {
    await tx.exchangeContractLand.deleteMany({ where: { exchangeContractId: contractId } });

    const contract = await tx.exchangeContract.update({
      where: { id: contractId },
      data: {
        permutanteId: input.permutanteId,
        type: input.type,
        appraisalValue: input.appraisalValue,
        contractDate: input.contractDate,
        notes: input.notes,
        status: input.status ?? before.status,
        managedBySystem: nextManagedBySystem,
        administrationFeePct: input.administrationFeePct,
        lands: { create: input.landIds.map((landId) => ({ landId })) },
      },
    });

    if (managedBySystemChanged) {
      for (const unit of before.units) {
        if (LOCKED_UNIT_STATUSES.includes(unit.status as (typeof LOCKED_UNIT_STATUSES)[number])) continue;
        const toStatus = nextManagedBySystem === false ? "EXCHANGE" : "AVAILABLE";
        if (unit.status === toStatus) continue;
        await changeUnitStatusTx(tx, {
          organizationId: context.organizationId,
          developmentId: before.developmentId,
          unitId: unit.id,
          fromStatus: unit.status,
          toStatus,
          actorUserId: context.userId,
          reason: `Gestão de vendas do contrato de permuta alterada para ${nextManagedBySystem ? "pelo sistema" : "fora de gestão"}.`,
        });
      }
    }

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: contract.id,
      beforeData: before,
      afterData: contract,
    });

    return contract;
  });
}

export async function deleteExchangeContract(context: AccessContext, contractId: string) {
  const contract = await prisma.exchangeContract.findFirst({
    where: { id: contractId, ...developmentOwnedScope(context) },
    include: { units: true },
  });
  if (!contract || !canAccessDevelopment(context, contract.developmentId)) {
    throw new Error("Contrato de permuta não encontrado.");
  }
  if (contract.units.length > 0) {
    throw new Error("Remova o destaque de todas as unidades antes de excluir o contrato.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.exchangeContract.delete({ where: { id: contractId } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: ENTITY_TYPE,
      entityId: contractId,
      beforeData: contract,
    });
  });

  if (contract.contractDocumentPath) await deleteEntityDocumentFile(contract.contractDocumentPath).catch(() => {});
}

export async function uploadExchangeContractDocument(context: AccessContext, contractId: string, file: File) {
  const contract = await prisma.exchangeContract.findFirst({
    where: { id: contractId, ...developmentOwnedScope(context) },
  });
  if (!contract || !canAccessDevelopment(context, contract.developmentId)) {
    throw new Error("Contrato de permuta não encontrado.");
  }

  const path = await uploadEntityDocument(file, ENTITY_TYPE, contractId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.exchangeContract.update({
      where: { id: contractId },
      data: { contractDocumentPath: path },
    });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: contractId,
      afterData: { contractDocumentPath: path },
    });
    return updated;
  });
}

/**
 * Destaque de unidade (Parte 2.1) — só a partir de AVAILABLE, e só em
 * contrato do tipo PHYSICAL/MIXED. Quando o contrato não é gerenciado pelo
 * sistema, a unidade sai do funil (status EXCHANGE) no mesmo passo.
 */
export async function destacarUnidade(context: AccessContext, contractId: string, unitId: string) {
  const contract = await prisma.exchangeContract.findFirst({
    where: { id: contractId, ...developmentOwnedScope(context) },
  });
  if (!contract || !canAccessDevelopment(context, contract.developmentId)) {
    throw new Error("Contrato de permuta não encontrado.");
  }
  if (contract.type === "FINANCIAL") throw new Error("Contrato de permuta financeira não destaca unidades.");

  const unit = await prisma.unit.findFirst({ where: { id: unitId, developmentId: contract.developmentId } });
  if (!unit) throw new Error("Unidade não encontrada.");
  if (unit.exchangeContractId) throw new Error("Unidade já destacada para outro contrato de permuta.");
  if (unit.status !== "AVAILABLE") throw new Error("Só é possível destacar unidades disponíveis.");

  const toStatus = contract.managedBySystem === false ? "EXCHANGE" : unit.status;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.unit.update({
      where: { id: unitId },
      data: { exchangeContractId: contractId, status: toStatus },
    });

    if (toStatus !== unit.status) {
      await changeUnitStatusTx(tx, {
        organizationId: context.organizationId,
        developmentId: contract.developmentId,
        unitId,
        fromStatus: unit.status,
        toStatus,
        actorUserId: context.userId,
        reason: "Unidade destacada para permuta física fora de gestão.",
      });
    }

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Unit",
      entityId: unitId,
      beforeData: { exchangeContractId: null },
      afterData: { exchangeContractId: contractId },
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: contract.developmentId,
      actorUserId: context.userId,
      eventType: "unit.exchange_destacada",
      entityType: "Unit",
      entityId: unitId,
      payload: { exchangeContractId: contractId },
    });

    return updated;
  });
}

export async function removerDestaque(context: AccessContext, contractId: string, unitId: string) {
  const contract = await prisma.exchangeContract.findFirst({
    where: { id: contractId, ...developmentOwnedScope(context) },
  });
  if (!contract || !canAccessDevelopment(context, contract.developmentId)) {
    throw new Error("Contrato de permuta não encontrado.");
  }

  const unit = await prisma.unit.findFirst({ where: { id: unitId, exchangeContractId: contractId } });
  if (!unit) throw new Error("Unidade não está destacada neste contrato.");

  const toStatus = unit.status === "EXCHANGE" ? "AVAILABLE" : unit.status;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.unit.update({
      where: { id: unitId },
      data: { exchangeContractId: null, status: toStatus },
    });

    if (toStatus !== unit.status) {
      await changeUnitStatusTx(tx, {
        organizationId: context.organizationId,
        developmentId: contract.developmentId,
        unitId,
        fromStatus: unit.status,
        toStatus,
        actorUserId: context.userId,
        reason: "Destaque de permuta removido.",
      });
    }

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Unit",
      entityId: unitId,
      beforeData: { exchangeContractId: contractId },
      afterData: { exchangeContractId: null },
    });

    return updated;
  });
}
