import "server-only";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { setCurrentOrgId } from "@/lib/tenant-context";

/**
 * Escopo de empreendimento do usuário (docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md,
 * Parte 2.5) — "ALL" quando algum `AccessGrant` não restringe SPE nem
 * Development (mesma semântica de união já usada pra `permissions`: um
 * grant sem restrição basta pra liberar tudo). Senão, o conjunto de
 * `developmentId`s explicitamente concedidos (via `developmentId` direto no
 * grant, ou via todo Development de um `speId` concedido).
 */
export type DevelopmentAccess = "ALL" | Set<string>;

export type AccessContext = {
  userId: string;
  organizationId: string;
  roleNames: string[];
  permissions: Set<string>; // "resource.action", ex.: "unit.create"
  developmentAccess: DevelopmentAccess;
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

  let hasUnrestrictedGrant = false;
  const grantedDevelopmentIds = new Set<string>();
  const grantedSpeIds = new Set<string>();

  for (const grant of grants) {
    if (grant.organizationId !== organizationId) continue; // V1: uma org por sessão
    roleNames.add(grant.role.name);
    for (const rp of grant.role.permissions) {
      permissions.add(`${rp.permission.resource}.${rp.permission.action}`);
    }

    if (!grant.speId && !grant.developmentId) {
      hasUnrestrictedGrant = true;
    } else {
      if (grant.developmentId) grantedDevelopmentIds.add(grant.developmentId);
      if (grant.speId) grantedSpeIds.add(grant.speId);
    }
  }

  let developmentAccess: DevelopmentAccess;
  if (hasUnrestrictedGrant) {
    developmentAccess = "ALL";
  } else {
    if (grantedSpeIds.size > 0) {
      const developmentsUnderGrantedSpes = await prisma.development.findMany({
        where: { speId: { in: [...grantedSpeIds] } },
        select: { id: true },
      });
      for (const d of developmentsUnderGrantedSpes) grantedDevelopmentIds.add(d.id);
    }
    developmentAccess = grantedDevelopmentIds;
  }

  // RLS (Pilar 2) — a partir daqui, toda query Prisma desta requisição
  // (mesma continuação assíncrona) passa a carregar este organizationId
  // pra extensão do Prisma setar via SET LOCAL. Ver src/lib/tenant-context.ts.
  setCurrentOrgId(organizationId);

  return {
    userId: authUser.id,
    organizationId,
    roleNames: [...roleNames],
    permissions,
    developmentAccess,
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
