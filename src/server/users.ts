import "server-only";

import { prisma, type TransactionClient } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent, getAuditSummaries } from "@/lib/audit";
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

export type UserAccessRow = {
  userId: string;
  fullName: string;
  email: string;
  roleId: string;
  roleName: string;
  /** "ALL" = acesso a todos os empreendimentos; senão, os developmentIds concedidos (docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 2.4.2). */
  developmentScope: "ALL" | string[];
  audit: { createdByName: string | null; createdAt: Date; updatedByName: string | null; updatedAt: Date };
};

/**
 * Um usuário pode ter mais de um AccessGrant na mesma organização — um por
 * empreendimento concedido (ou um único grant sem developmentId/speId pra
 * "todos"). A tela de Usuários mostra uma linha por usuário, agregando os
 * grants dele; editar/revogar operam sobre o conjunto inteiro (ver
 * `updateUserAccess`/`revokeUserAccess` abaixo).
 */
export async function listOrganizationUsersPaged(
  context: AccessContext,
  params: { search?: string; sortBy?: UserSortField; sortDir?: "asc" | "desc"; page?: number; pageSize?: number },
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "name";
  const sortDir = params.sortDir ?? "asc";
  const search = params.search?.trim();

  const allGrants = await prisma.accessGrant.findMany({
    where: {
      organizationId: context.organizationId,
      ...(search
        ? {
            OR: [
              { user: { fullName: { contains: search, mode: "insensitive" as const } } },
              { user: { email: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    include: { user: true, role: true },
    orderBy: { createdAt: "asc" },
  });

  const byUser = new Map<string, typeof allGrants>();
  for (const grant of allGrants) {
    const list = byUser.get(grant.userId) ?? [];
    list.push(grant);
    byUser.set(grant.userId, list);
  }

  const grantIds = allGrants.map((g) => g.id);
  const audit = await getAuditSummaries(
    context.organizationId,
    "AccessGrant",
    grantIds,
    new Map(allGrants.map((g) => [g.id, { createdAt: g.createdAt, updatedAt: g.createdAt }])),
  );

  let rows: UserAccessRow[] = [...byUser.values()].map((grants) => {
    const first = grants[0];
    const hasUnrestricted = grants.some((g) => !g.developmentId && !g.speId);
    const summaries = grants.map((g) => audit.get(g.id)!);
    const created = summaries.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
    const updated = summaries.reduce((a, b) => (a.updatedAt >= b.updatedAt ? a : b));

    return {
      userId: first.userId,
      fullName: first.user.fullName,
      email: first.user.email,
      roleId: first.roleId,
      roleName: first.role.name,
      developmentScope: hasUnrestricted ? "ALL" : grants.filter((g) => g.developmentId).map((g) => g.developmentId!),
      audit: {
        createdByName: created.createdByName,
        createdAt: created.createdAt,
        updatedByName: updated.updatedByName,
        updatedAt: updated.updatedAt,
      },
    };
  });

  rows.sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "name") return a.fullName.localeCompare(b.fullName, "pt-BR") * dir;
    if (sortBy === "email") return a.email.localeCompare(b.email, "pt-BR") * dir;
    if (sortBy === "role") return a.roleName.localeCompare(b.roleName, "pt-BR") * dir;
    return (a.audit.createdAt.getTime() - b.audit.createdAt.getTime()) * dir;
  });

  const total = rows.length;
  rows = rows.slice((page - 1) * pageSize, page * pageSize);

  return { items: rows, total, page, pageSize };
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
  /** null/undefined = acesso a todos os empreendimentos; array (mesmo vazio) restringe aos IDs informados. */
  developmentIds?: string[] | null;
};

async function assertDevelopmentsOwned(
  tx: TransactionClient,
  context: AccessContext,
  developmentIds: string[],
) {
  if (developmentIds.length === 0) return;
  const count = await tx.development.count({
    where: { id: { in: developmentIds }, organizationId: context.organizationId },
  });
  if (count !== developmentIds.length) throw new Error("Empreendimento inválido.");
}

/**
 * Convida um novo usuário: cria o registro no Supabase Auth (envia e-mail de
 * convite), espelha em User e concede o Role informado na organização atual
 * — um AccessGrant por empreendimento selecionado, ou um único grant sem
 * escopo se `developmentIds` for null/undefined ("todos os empreendimentos").
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
  const developmentIds = input.developmentIds ?? null;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { id: authUserId },
      create: { id: authUserId, email: input.email, fullName: input.fullName },
      update: { fullName: input.fullName },
    });

    if (developmentIds) await assertDevelopmentsOwned(tx, context, developmentIds);

    const scopes: (string | null)[] = developmentIds && developmentIds.length > 0 ? developmentIds : [null];
    const grants = [];
    for (const developmentId of scopes) {
      const grant = await tx.accessGrant.create({
        data: {
          organizationId: context.organizationId,
          userId: user.id,
          roleId: input.roleId,
          developmentId: developmentId ?? undefined,
        },
      });
      grants.push(grant);
      await recordAuditEvent(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "create",
        entityType: "AccessGrant",
        entityId: grant.id,
        afterData: grant,
      });
    }

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      eventType: "user.invited",
      entityType: "User",
      entityId: user.id,
      payload: { email: user.email, roleId: input.roleId, developmentIds: developmentIds ?? "ALL" },
    });

    return { user, grants };
  });
}

export type UpdateUserAccessInput = {
  roleId: string;
  /** null/undefined = acesso a todos os empreendimentos. */
  developmentIds?: string[] | null;
};

async function assertNotLastAdmin(
  tx: TransactionClient,
  context: AccessContext,
  userId: string,
  newRoleId: string,
) {
  const currentGrants = await tx.accessGrant.findMany({
    where: { organizationId: context.organizationId, userId },
    include: { role: true },
  });
  const wasAdmin = currentGrants.some((g) => g.role.name === "Administrador da plataforma");
  if (!wasAdmin) return;

  const newRole = await tx.role.findUnique({ where: { id: newRoleId } });
  if (newRole?.name === "Administrador da plataforma") return;

  const otherAdmins = await tx.accessGrant.count({
    where: {
      organizationId: context.organizationId,
      role: { name: "Administrador da plataforma" },
      userId: { not: userId },
    },
  });
  if (otherAdmins === 0) {
    throw new Error("Não é possível alterar: é o único Administrador da plataforma da organização.");
  }
}

/**
 * Troca o papel e/ou o escopo de empreendimento de um usuário: substitui
 * todo o conjunto de AccessGrant dele nesta organização (delete + recria),
 * já que o escopo agora pode ser mais de um grant (um por empreendimento).
 */
export async function updateUserAccess(context: AccessContext, userId: string, input: UpdateUserAccessInput) {
  const developmentIds = input.developmentIds ?? null;

  return prisma.$transaction(async (tx) => {
    const before = await tx.accessGrant.findMany({ where: { organizationId: context.organizationId, userId } });
    if (before.length === 0) throw new Error("Usuário não encontrado.");

    await assertNotLastAdmin(tx, context, userId, input.roleId);
    if (developmentIds) await assertDevelopmentsOwned(tx, context, developmentIds);

    await tx.accessGrant.deleteMany({ where: { organizationId: context.organizationId, userId } });

    const scopes: (string | null)[] = developmentIds && developmentIds.length > 0 ? developmentIds : [null];
    const grants = [];
    for (const developmentId of scopes) {
      const grant = await tx.accessGrant.create({
        data: {
          organizationId: context.organizationId,
          userId,
          roleId: input.roleId,
          developmentId: developmentId ?? undefined,
        },
      });
      grants.push(grant);
    }

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "AccessGrant",
      entityId: grants[0].id,
      beforeData: before,
      afterData: grants,
    });

    return grants;
  });
}

/**
 * Revoga o acesso de um usuário à organização (remove todos os AccessGrant
 * dele, não o User — ele pode ter acesso a outras organizações no futuro
 * SaaS). Bloqueia auto-revogação e revogação do último Administrador da
 * plataforma, pra evitar que a organização fique sem ninguém com acesso
 * total.
 */
export async function revokeUserAccess(context: AccessContext, userId: string) {
  if (userId === context.userId) {
    throw new Error("Você não pode revogar o seu próprio acesso.");
  }

  const grants = await prisma.accessGrant.findMany({
    where: { organizationId: context.organizationId, userId },
    include: { role: true, user: true },
  });
  if (grants.length === 0) throw new Error("Usuário não encontrado.");

  if (grants.some((g) => g.role.name === "Administrador da plataforma")) {
    const otherAdmins = await prisma.accessGrant.count({
      where: {
        organizationId: context.organizationId,
        role: { name: "Administrador da plataforma" },
        userId: { not: userId },
      },
    });
    if (otherAdmins === 0) {
      throw new Error("Não é possível revogar: é o único Administrador da plataforma da organização.");
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.accessGrant.deleteMany({ where: { organizationId: context.organizationId, userId } });
    for (const grant of grants) {
      await recordAuditEvent(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "delete",
        entityType: "AccessGrant",
        entityId: grant.id,
        beforeData: grant,
      });
    }
  });
}
