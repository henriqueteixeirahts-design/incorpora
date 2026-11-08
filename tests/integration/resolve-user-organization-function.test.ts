import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * RLS Pilar 2, preparação da Etapa 4 — `resolve_user_organization()`
 * (SECURITY DEFINER) é como o login (`getAccessContext`, em
 * src/server/auth-context.ts) descobre a organização do usuário ANTES de
 * existir contexto de tenant — sem ela, a policy de `access_grants` (com
 * contexto vazio) não deixaria ver vínculo nenhum e ninguém entraria.
 * Devolve só o id da organização do vínculo mais antigo, nada mais.
 */

async function resolve(userId: string) {
  const rows = await prisma.$queryRawUnsafe<{ organization_id: string | null }[]>(
    `SELECT resolve_user_organization($1::uuid) AS organization_id`,
    userId,
  );
  return rows[0]?.organization_id ?? null;
}

describe("resolve_user_organization() — login sem leitura cross-tenant", () => {
  it("devolve a organização do vínculo mais antigo do usuário, e nulo pra quem não tem vínculo", async () => {
    const orgA = await prisma.organization.create({ data: { name: "Org A — resolve_user_organization" } });
    const orgB = await prisma.organization.create({ data: { name: "Org B — resolve_user_organization" } });
    const role = await prisma.role.create({ data: { organizationId: orgA.id, name: `Papel ${crypto.randomUUID()}` } });
    const roleB = await prisma.role.create({ data: { organizationId: orgB.id, name: `Papel ${crypto.randomUUID()}` } });
    const user = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@teste.local`, fullName: "Usuário resolve" },
    });
    const loner = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@teste.local`, fullName: "Usuário sem vínculo" },
    });
    try {
      await prisma.accessGrant.create({
        data: { organizationId: orgA.id, userId: user.id, roleId: role.id, createdAt: new Date("2026-01-01") },
      });
      await prisma.accessGrant.create({
        data: { organizationId: orgB.id, userId: user.id, roleId: roleB.id, createdAt: new Date("2026-06-01") },
      });

      expect(await resolve(user.id)).toBe(orgA.id);
      expect(await resolve(loner.id)).toBeNull();
    } finally {
      await prisma.accessGrant.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: { in: [user.id, loner.id] } } });
      await prisma.role.deleteMany({ where: { id: { in: [role.id, roleB.id] } } });
      await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    }
  });

  it("app_user consegue executar a função (privilégio concedido explicitamente)", async () => {
    const rows = await prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `SELECT has_function_privilege(current_user, 'resolve_user_organization(uuid)', 'EXECUTE') AS ok`,
    );
    expect(rows[0]?.ok).toBe(true);
  });

  it("nenhuma role do PostgREST/Supabase (anon, authenticated, service_role) consegue executar", async () => {
    const rows = await prisma.$queryRawUnsafe<{ rolname: string; has_execute: boolean }[]>(`
      SELECT r.rolname, has_function_privilege(r.rolname, 'resolve_user_organization(uuid)', 'EXECUTE') AS has_execute
      FROM pg_roles r
      WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
    `);
    // Em Postgres local/CI essas roles não existem; no Supabase, toda linha precisa vir false.
    for (const row of rows) {
      expect(row.has_execute, `${row.rolname} não deveria conseguir executar resolve_user_organization()`).toBe(false);
    }
  });
});
