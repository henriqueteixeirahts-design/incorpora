import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import type { AccessContext } from "@/server/auth-context";
import type { Prisma, SpeStatus } from "@/generated/prisma/client";

export function listSpes(organizationId: string) {
  return prisma.specialPurposeEntity.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
}

export type SpeSortField = "name" | "document" | "createdAt";

export async function listSpesPaged(
  organizationId: string,
  params: { search?: string; sortBy?: SpeSortField; sortDir?: "asc" | "desc"; page?: number; pageSize?: number },
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "name";
  const sortDir = params.sortDir ?? "asc";
  const search = params.search?.trim();

  const where: Prisma.SpecialPurposeEntityWhereInput = {
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
    prisma.specialPurposeEntity.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.specialPurposeEntity.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export function getSpe(organizationId: string, speId: string) {
  return prisma.specialPurposeEntity.findFirst({ where: { id: speId, organizationId } });
}

export async function getSpeDetail(organizationId: string, speId: string) {
  const spe = await prisma.specialPurposeEntity.findFirst({ where: { id: speId, organizationId } });
  if (!spe) return null;

  const auditTrail = await prisma.auditEvent.findMany({
    where: { organizationId, entityType: "SpecialPurposeEntity", entityId: speId },
    orderBy: { createdAt: "asc" },
    include: { actor: true },
  });
  const createdEvent = auditTrail[0] ?? null;
  const updatedEvent = auditTrail[auditTrail.length - 1] ?? null;

  const bankAccountLinks = await prisma.speBankAccount.findMany({
    where: { speId },
    include: { bankAccount: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  const [partners, investors] = await Promise.all([
    prisma.spePartner.findMany({ where: { speId }, orderBy: [{ endDate: "asc" }, { createdAt: "asc" }] }),
    prisma.speInvestor.findMany({ where: { speId }, orderBy: { createdAt: "asc" } }),
  ]);

  return {
    ...spe,
    audit: {
      createdByName: createdEvent?.actor?.fullName ?? null,
      createdAt: createdEvent?.createdAt ?? spe.createdAt,
      updatedByName: updatedEvent?.actor?.fullName ?? null,
      updatedAt: updatedEvent?.createdAt ?? spe.updatedAt,
    },
    bankAccountLinks,
    partners: partners.map((p) => ({
      ...p,
      participationPct: Number(p.participationPct),
    })),
    investors: investors.map((i) => ({
      ...i,
      contributedCapital: i.contributedCapital === null ? null : Number(i.contributedCapital),
      resultParticipationPct: i.resultParticipationPct === null ? null : Number(i.resultParticipationPct),
    })),
    activePartnersParticipationTotal: partners
      .filter((p) => !p.endDate)
      .reduce((sum, p) => sum + Number(p.participationPct), 0),
  };
}

export class DuplicateSpeDocumentError extends Error {
  constructor(
    public speId: string,
    public speName: string,
  ) {
    super(`Já existe uma SPE cadastrada com este CNPJ: ${speName}.`);
  }
}

async function assertDocumentNotDuplicated(
  organizationId: string,
  document: string,
  excludeSpeId?: string,
) {
  const existing = await prisma.specialPurposeEntity.findFirst({
    where: { organizationId, document, ...(excludeSpeId ? { id: { not: excludeSpeId } } : {}) },
  });
  if (existing) throw new DuplicateSpeDocumentError(existing.id, existing.name);
}

export type CreateSpeInput = {
  name: string;
  tradeName?: string;
  document: string;
  nire?: string;
  foundedAt?: Date;
  legalNature?: string;
  cnae?: string;
  status: SpeStatus;
  email?: string;
  phone?: string;
  website?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

export async function createSpe(context: AccessContext, input: CreateSpeInput) {
  await assertDocumentNotDuplicated(context.organizationId, input.document);

  return prisma.$transaction(async (tx) => {
    const spe = await tx.specialPurposeEntity.create({
      data: { organizationId: context.organizationId, ...input },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "SpecialPurposeEntity",
      entityId: spe.id,
      afterData: spe,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      eventType: "spe.created",
      entityType: "SpecialPurposeEntity",
      entityId: spe.id,
      payload: { name: spe.name, document: spe.document },
    });

    return spe;
  });
}

export async function updateSpe(context: AccessContext, speId: string, input: CreateSpeInput) {
  const before = await prisma.specialPurposeEntity.findFirst({
    where: { id: speId, organizationId: context.organizationId },
  });
  if (!before) throw new Error("SPE não encontrada.");

  await assertDocumentNotDuplicated(context.organizationId, input.document, speId);

  return prisma.$transaction(async (tx) => {
    const spe = await tx.specialPurposeEntity.update({
      where: { id: speId },
      data: input,
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "SpecialPurposeEntity",
      entityId: spe.id,
      beforeData: before,
      afterData: spe,
    });

    return spe;
  });
}

export async function deleteSpe(context: AccessContext, speId: string) {
  const spe = await prisma.specialPurposeEntity.findFirst({
    where: { id: speId, organizationId: context.organizationId },
  });
  if (!spe) throw new Error("SPE não encontrada.");

  const developmentsCount = await prisma.development.count({ where: { speId } });
  if (developmentsCount > 0) {
    throw new Error(
      `Não é possível excluir: a SPE tem ${developmentsCount} empreendimento(s) vinculado(s).`,
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.specialPurposeEntity.delete({ where: { id: speId } });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: "SpecialPurposeEntity",
      entityId: speId,
      beforeData: spe,
    });
  });
}
