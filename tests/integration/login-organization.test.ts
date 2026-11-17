import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { LOGIN_ORG_RESOLUTION_FAILED_EVENT, resolveLoginOrganization } from "@/server/login-organization";
import { expectNoSupabaseRoleCanExecute } from "./helpers/supabase-roles";
import { fixturePrisma } from "./helpers/tenant";

/**
 * Login com falha barulhenta (2026-11-10) — ver src/server/login-organization.ts.
 * Fixtures pela conexão da role de migrations (`fixturePrisma`), porque
 * `access_grants` fica sob policy no Grupo 17; o código testado roda como
 * app_user, sem contexto de organização (é assim no login).
 */
async function makeUser(withGrant: boolean) {
  const db = fixturePrisma();
  const user = await db.user.create({
    data: { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@teste.local`, fullName: "Login" },
  });
  const org = await db.organization.create({ data: { name: "Org — login barulhento" } });
  const role = await db.role.create({ data: { organizationId: org.id, name: `Papel ${crypto.randomUUID()}` } });
  if (withGrant) await db.accessGrant.create({ data: { organizationId: org.id, userId: user.id, roleId: role.id } });
  const cleanup = async () => {
    await db.accessGrant.deleteMany({ where: { userId: user.id } });
    await db.role.deleteMany({ where: { id: role.id } });
    await db.user.deleteMany({ where: { id: user.id } });
    await db.organization.deleteMany({ where: { id: org.id } });
  };
  return { user, org, cleanup };
}

describe("Login — resolução da organização com falha barulhenta", () => {
  it("usuário COM vínculo: resolve a organização, sem erro registrado", async () => {
    const { user, org, cleanup } = await makeUser(true);
    const logError = vi.fn();
    try {
      expect(await resolveLoginOrganization(user.id, { logError })).toEqual({ status: "RESOLVED", organizationId: org.id });
      expect(logError).not.toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  });

  it("usuário SEM vínculo: NO_GRANT, sem erro registrado (caso normal — volta pro login)", async () => {
    const { user, cleanup } = await makeUser(false);
    const logError = vi.fn();
    try {
      expect(await resolveLoginOrganization(user.id, { logError })).toEqual({ status: "NO_GRANT" });
      expect(logError).not.toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  });

  it("usuário COM vínculo mas a resolução devolve nulo: RESOLUTION_FAILED e erro explícito com evento próprio", async () => {
    const { user, cleanup } = await makeUser(true);
    const logError = vi.fn();
    try {
      // Simula a função quebrada; a contagem é a real, no banco.
      const result = await resolveLoginOrganization(user.id, { resolve: async () => null, logError });
      expect(result).toEqual({ status: "RESOLUTION_FAILED", grantCount: 1 });
      expect(logError).toHaveBeenCalledTimes(1);
      expect(logError.mock.calls[0][0]).toMatchObject({ event: LOGIN_ORG_RESOLUTION_FAILED_EVENT, level: "error", userId: user.id, grantCount: 1 });
    } finally {
      await cleanup();
    }
  });

  it("sem logError injetado, o erro vai pro console.error como JSON com o evento (o que a Vercel registra)", async () => {
    const { user, cleanup } = await makeUser(true);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await resolveLoginOrganization(user.id, { resolve: async () => null });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ event: LOGIN_ORG_RESOLUTION_FAILED_EVENT });
    } finally {
      spy.mockRestore();
      await cleanup();
    }
  });
});

describe("count_user_access_grants() — travas", () => {
  it("SECURITY DEFINER, search_path vazio, um parâmetro uuid, retorno integer escalar, sem EXECUTE pra PUBLIC", async () => {
    const rows = await prisma.$queryRawUnsafe<
      { secdef: boolean; config: string[] | null; args: string; returns: string; retset: boolean; public_execute: boolean }[]
    >(`
      SELECT p.prosecdef AS secdef, p.proconfig AS config,
             pg_get_function_identity_arguments(p.oid) AS args,
             format_type(p.prorettype, NULL) AS returns, p.proretset AS retset,
             EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_execute
        FROM pg_proc p WHERE p.proname = 'count_user_access_grants'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      secdef: true,
      config: ['search_path=""'],
      args: "p_user_id uuid",
      returns: "integer",
      retset: false,
      public_execute: false,
    });
  });

  it("app_user consegue executar", async () => {
    const rows = await prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `SELECT has_function_privilege(current_user, 'count_user_access_grants(uuid)', 'EXECUTE') AS ok`,
    );
    expect(rows[0]?.ok).toBe(true);
  });

  it("nenhuma role do PostgREST/Supabase consegue executar", async () => {
    await expectNoSupabaseRoleCanExecute("count_user_access_grants(uuid)");
  });
});
