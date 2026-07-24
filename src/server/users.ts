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
