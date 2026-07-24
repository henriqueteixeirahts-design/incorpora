import "server-only";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export type AccessContext = {
  userId: string;
  organizationId: string;
  roleNames: string[];
  permissions: Set<string>; // "resource.action", ex.: "unit.create"
};

/** Usuário autenticado no Supabase Auth, ou null se não houver sessão. */
export async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Contexto de acesso do usuário logado: organização ativa, papéis e o
 * conjunto de permissões resolvido a partir de todos os AccessGrant sem
 * escopo restrito (ou com escopo na organização inteira). V1 assume que
 * cada usuário opera em uma única organização — troca de organização fica
 * para a Fase 18 (SaaS).
 */
export async function getAccessContext(): Promise<AccessContext | null> {
  const authUser = await getAuthUser();
  if (!authUser) return null;

  const grants = await prisma.accessGrant.findMany({
    where: { userId: authUser.id },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  if (grants.length === 0) return null;

  const organizationId = grants[0].organizationId;
  const roleNames = new Set<string>();
  const permissions = new Set<string>();

  for (const grant of grants) {
    if (grant.organizationId !== organizationId) continue; // V1: uma org por sessão
    roleNames.add(grant.role.name);
    for (const rp of grant.role.permissions) {
      permissions.add(`${rp.permission.resource}.${rp.permission.action}`);
    }
  }

  return {
    userId: authUser.id,
    organizationId,
    roleNames: [...roleNames],
    permissions,
  };
}

export function hasPermission(
  context: AccessContext,
  resource: string,
  action: string,
) {
  return context.permissions.has(`${resource}.${action}`);
}

/** Exige sessão + AccessGrant válido; redireciona para /login caso contrário. */
export async function requireAccessContext(): Promise<AccessContext> {
  const context = await getAccessContext();
  if (!context) {
    redirect("/login");
  }
  return context;
}
