import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import type { AccessContext } from "@/server/auth-context";

/**
 * Perfis (docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 2.4.1) — matriz
 * módulo×ação sobre o modelo Role/Permission/RolePermission já existente
 * (Parte 2.1: nada de schema novo aqui). Papel de sistema (`isSystem`,
 * `organizationId: null`) é sempre somente-leitura — editar exige duplicar
 * pra um papel customizado da organização primeiro.
 */

export function listPermissionsCatalog() {
  return prisma.permission.findMany({ orderBy: [{ resource: "asc" }, { action: "asc" }] });
}

export function listRolesWithPermissions(context: AccessContext) {
  return prisma.role.findMany({
    where: { OR: [{ organizationId: context.organizationId }, { organizationId: null }] },
    include: {
      permissions: { select: { permissionId: true } },
      _count: { select: { accessGrants: { where: { organizationId: context.organizationId } } } },
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
}

export type UpsertRoleInput = {
  name: string;
  description?: string;
  permissionIds: string[];
};

function friendlyRoleError(error: unknown): never {
  if (error instanceof Error && error.message.includes("Unique constraint")) {
    throw new Error("Já existe um perfil com esse nome nesta organização.");
  }
  throw error instanceof Error ? error : new Error("Falha ao salvar o perfil.");
}

export async function createCustomRole(context: AccessContext, input: UpsertRoleInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          organizationId: context.organizationId,
          name: input.name,
          description: input.description || null,
          isSystem: false,
          permissions: { create: input.permissionIds.map((permissionId) => ({ permissionId })) },
        },
      });

      await recordAuditEvent(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "Role",
        entityId: role.id,
        afterData: { ...role, permissionIds: input.permissionIds },
      });

      return role;
    });
  } catch (error) {
    friendlyRoleError(error);
  }
}

export async function updateCustomRole(context: AccessContext, roleId: string, input: UpsertRoleInput) {
  const before = await prisma.role.findFirst({
    where: { id: roleId, organizationId: context.organizationId, isSystem: false },
    include: { permissions: { select: { permissionId: true } } },
  });
  if (!before) throw new Error("Perfil não encontrado.");

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      const role = await tx.role.update({
        where: { id: roleId },
        data: {
          name: input.name,
          description: input.description || null,
          permissions: { create: input.permissionIds.map((permissionId) => ({ permissionId })) },
        },
      });

      await recordAuditEvent(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "update",
        entityType: "Role",
        entityId: role.id,
        beforeData: { ...before, permissionIds: before.permissions.map((p) => p.permissionId) },
        afterData: { ...role, permissionIds: input.permissionIds },
      });

      return role;
    });
  } catch (error) {
    friendlyRoleError(error);
  }
}

/** Duplica um papel (de sistema ou de outra organização visível) pra um papel customizado editável desta organização. */
export async function duplicateRoleForCustomization(context: AccessContext, sourceRoleId: string, newName: string) {
  const source = await prisma.role.findFirst({
    where: { id: sourceRoleId, OR: [{ organizationId: context.organizationId }, { organizationId: null }] },
    include: { permissions: { select: { permissionId: true } } },
  });
  if (!source) throw new Error("Perfil não encontrado.");

  try {
    return await prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          organizationId: context.organizationId,
          name: newName,
          description: source.description,
          isSystem: false,
          permissions: { create: source.permissions.map((p) => ({ permissionId: p.permissionId })) },
        },
      });

      await recordAuditEvent(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "Role",
        entityId: role.id,
        afterData: { ...role, duplicatedFrom: source.id },
      });

      return role;
    });
  } catch (error) {
    friendlyRoleError(error);
  }
}

export async function deleteCustomRole(context: AccessContext, roleId: string) {
  const role = await prisma.role.findFirst({ where: { id: roleId, organizationId: context.organizationId, isSystem: false } });
  if (!role) throw new Error("Perfil não encontrado.");

  const grantsCount = await prisma.accessGrant.count({ where: { roleId } });
  if (grantsCount > 0) {
    throw new Error(`Não é possível excluir: o perfil está atribuído a ${grantsCount} usuário(s).`);
  }

  return prisma.$transaction(async (tx) => {
    await tx.role.delete({ where: { id: roleId } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: "Role",
      entityId: roleId,
      beforeData: role,
    });
  });
}
