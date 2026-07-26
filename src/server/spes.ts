import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import type { AccessContext } from "@/server/auth-context";
import type { Prisma } from "@/generated/prisma/client";

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

export async function getSpe(organizationId: string, speId: string) {
  return prisma.specialPurposeEntity.findFirst({ where: { id: speId, organizationId } });
}

export type CreateSpeInput = {
  name: string;
  document: string;
  address?: string;
};

export async function createSpe(context: AccessContext, input: CreateSpeInput) {
  return prisma.$transaction(async (tx) => {
    const spe = await tx.specialPurposeEntity.create({
      data: {
        organizationId: context.organizationId,
        name: input.name,
        document: input.document,
        address: input.address,
      },
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
  return prisma.$transaction(async (tx) => {
    const before = await tx.specialPurposeEntity.findFirst({
      where: { id: speId, organizationId: context.organizationId },
    });
    if (!before) throw new Error("SPE não encontrada.");

    const spe = await tx.specialPurposeEntity.update({
      where: { id: speId },
      data: { name: input.name, document: input.document, address: input.address },
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
