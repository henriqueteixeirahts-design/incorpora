import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { orgScope } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";
import type { CustomerType, Prisma } from "@/generated/prisma/client";

const ENTITY_TYPE = "Permutante";

export type PermutanteSortField = "name" | "type" | "document" | "createdAt";

export async function listPermutantesPaged(
  organizationId: string,
  params: { search?: string; sortBy?: PermutanteSortField; sortDir?: "asc" | "desc"; page?: number; pageSize?: number },
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "name";
  const sortDir = params.sortDir ?? "asc";
  const search = params.search?.trim();

  const where: Prisma.PermutanteWhereInput = {
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
    prisma.permutante.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.permutante.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export function listAllPermutantes(organizationId: string) {
  return prisma.permutante.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export function getPermutante(organizationId: string, permutanteId: string) {
  return prisma.permutante.findFirst({ where: { id: permutanteId, organizationId } });
}

export type CreatePermutanteInput = {
  type: CustomerType;
  name: string;
  document: string;
  email?: string;
  phone?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  notes?: string;
};

export class DuplicatePermutanteDocumentError extends Error {
  constructor(
    public permutanteId: string,
    public permutanteName: string,
  ) {
    super(`Já existe um permutante cadastrado com este documento: ${permutanteName}.`);
  }
}

async function assertDocumentNotDuplicated(organizationId: string, document: string, excludeId?: string) {
  const existing = await prisma.permutante.findFirst({
    where: { organizationId, document, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (existing) throw new DuplicatePermutanteDocumentError(existing.id, existing.name);
}

export async function createPermutante(context: AccessContext, input: CreatePermutanteInput) {
  await assertDocumentNotDuplicated(context.organizationId, input.document);

  return prisma.$transaction(async (tx) => {
    const permutante = await tx.permutante.create({
      data: { organizationId: context.organizationId, ...input },
    });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: ENTITY_TYPE,
      entityId: permutante.id,
      afterData: permutante,
    });
    return permutante;
  });
}

export async function updatePermutante(
  context: AccessContext,
  permutanteId: string,
  input: CreatePermutanteInput,
) {
  const before = await prisma.permutante.findFirst({ where: { id: permutanteId, ...orgScope(context) } });
  if (!before) throw new Error("Permutante não encontrado.");
  if (input.document !== before.document) {
    await assertDocumentNotDuplicated(context.organizationId, input.document, permutanteId);
  }

  return prisma.$transaction(async (tx) => {
    const permutante = await tx.permutante.update({ where: { id: permutanteId }, data: input });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: permutante.id,
      beforeData: before,
      afterData: permutante,
    });
    return permutante;
  });
}

export async function deletePermutante(context: AccessContext, permutanteId: string) {
  const permutante = await prisma.permutante.findFirst({ where: { id: permutanteId, ...orgScope(context) } });
  if (!permutante) throw new Error("Permutante não encontrado.");

  const contractCount = await prisma.exchangeContract.count({ where: { permutanteId } });
  if (contractCount > 0) throw new Error("Permutante possui contrato(s) de permuta — não pode ser removido.");

  await prisma.$transaction(async (tx) => {
    await tx.permutante.delete({ where: { id: permutanteId } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: ENTITY_TYPE,
      entityId: permutanteId,
      beforeData: permutante,
    });
  });
}
