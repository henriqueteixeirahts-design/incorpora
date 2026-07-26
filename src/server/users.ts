import "server-only";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import type { AccessContext } from "@/server/auth-context";

export function listOrganizationUsers(organizationId: string) {
  return prisma.accessGrant.findMany({
    where: { organizationId, developmentId: null, speId: null },
    include: { user: true, role: true },
    orderBy: { createdAt: "asc" },
  });
}

export type UserSortField = "name" | "email" | "role" | "createdAt";

export async function listOrganizationUsersPaged(
  organizationId: string,
  params: { search?: string; sortBy?: UserSortField; sortDir?: "asc" | "desc"; page?: number; pageSize?: number },
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "name";
  const sortDir = params.sortDir ?? "asc";
  const search = params.search?.trim();

  // AccessGrant não guarda nome/e-mail diretamente (vem do User relacionado)
  // — busca e ordenação por essas colunas usam o relacionamento.
  const where = {
    organizationId,
    developmentId: null,
    speId: null,
    ...(search
      ? {
          OR: [
            { user: { fullName: { contains: search, mode: "insensitive" as const } } },
            { user: { email: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const orderBy =
    sortBy === "name"
      ? { user: { fullName: sortDir } }
      : sortBy === "email"
        ? { user: { email: sortDir } }
        : sortBy === "role"
          ? { role: { name: sortDir } }
          : { createdAt: sortDir };

  const [items, total] = await Promise.all([
    prisma.accessGrant.findMany({
      where,
      include: { user: true, role: true },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.accessGrant.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export function listRoles(organizationId: string) {
  return prisma.role.findMany({
    where: { OR: [{ organizationId }, { organizationId: null }] },
    orderBy: { name: "asc" },
  });
}

export type InviteUserInput = {
  email: string;
  fullName: string;
  roleId: string;
};

/**
 * Convida um novo usuário: cria o registro no Supabase Auth (envia e-mail de
 * convite), espelha em User e concede o Role informado na organização atual.
 * Requer SUPABASE_SERVICE_ROLE_KEY configurada.
 */
export async function inviteUser(context: AccessContext, input: InviteUserInput) {
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: { fullName: input.fullName },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Falha ao convidar usuário no Supabase Auth");
  }

  const authUserId = data.user.id;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { id: authUserId },
      create: { id: authUserId, email: input.email, fullName: input.fullName },
      update: { fullName: input.fullName },
    });

    const grant = await tx.accessGrant.create({
      data: {
        organizationId: context.organizationId,
        userId: user.id,
        roleId: input.roleId,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "AccessGrant",
      entityId: grant.id,
      afterData: grant,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      eventType: "user.invited",
      entityType: "User",
      entityId: user.id,
      payload: { email: user.email, roleId: input.roleId },
    });

    return { user, grant };
  });
}

/** Troca o papel de um usuário na organização (edição do AccessGrant). */
export async function updateUserRole(context: AccessContext, grantId: string, roleId: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.accessGrant.findFirst({
      where: { id: grantId, organizationId: context.organizationId, developmentId: null, speId: null },
    });
    if (!before) throw new Error("Usuário não encontrado.");

    const grant = await tx.accessGrant.update({ where: { id: grantId }, data: { roleId } });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "AccessGrant",
      entityId: grant.id,
      beforeData: before,
      afterData: grant,
    });

    return grant;
  });
}

/**
 * Revoga o acesso de um usuário à organização (remove o AccessGrant, não o
 * User — ele pode ter acesso a outras organizações no futuro SaaS). Bloqueia
 * auto-revogação e revogação do último Administrador da plataforma, para
 * evitar que a organização fique sem ninguém com acesso total.
 */
export async function revokeUserAccess(context: AccessContext, grantId: string) {
  const grant = await prisma.accessGrant.findFirst({
    where: { id: grantId, organizationId: context.organizationId, developmentId: null, speId: null },
    include: { role: true, user: true },
  });
  if (!grant) throw new Error("Usuário não encontrado.");

  if (grant.userId === context.userId) {
    throw new Error("Você não pode revogar o seu próprio acesso.");
  }

  if (grant.role.name === "Administrador da plataforma") {
    const otherAdmins = await prisma.accessGrant.count({
      where: {
        organizationId: context.organizationId,
        role: { name: "Administrador da plataforma" },
        id: { not: grantId },
      },
    });
    if (otherAdmins === 0) {
      throw new Error("Não é possível revogar: é o único Administrador da plataforma da organização.");
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.accessGrant.delete({ where: { id: grantId } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: "AccessGrant",
      entityId: grantId,
      beforeData: grant,
    });
  });
}
