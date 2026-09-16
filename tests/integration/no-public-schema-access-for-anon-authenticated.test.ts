import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * INCIDENTE DE SEGURANÇA (ver docs/STATUS_IMPLANTACAO.md) — o Supabase
 * concede, por padrão, acesso total a toda tabela/sequence/função do
 * schema `public` pras roles `anon`/`authenticated`/`service_role` (é
 * assim que o Data API/PostgREST funciona por padrão). Este projeto nunca
 * usa o Data API pra dado nenhum (confirmado: só `.auth.*`/`.storage.*` do
 * client do Supabase, nunca `.from()`/`.rpc()`) — então esse acesso era
 * puro excesso de privilégio, sem RLS nenhuma barrando. Este teste roda em
 * todo ambiente Supabase pra nunca deixar isso voltar sem ninguém notar.
 *
 * Em Postgres local puro (Docker) as roles anon/authenticated/service_role
 * não existem — os testes que dependem delas viram no-op explícito
 * (comentado no próprio teste), não um erro.
 */

async function existingSupabaseRoles(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ rolname: string }[]>(
    `SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')`,
  );
  return rows.map((r) => r.rolname);
}

describe("Nenhuma role do PostgREST tem acesso a objeto nenhum do schema public", () => {
  it("zero tabelas com qualquer privilégio pra anon/authenticated/service_role", async () => {
    const roles = await existingSupabaseRoles();
    if (roles.length === 0) return; // Postgres local puro — nada a checar

    const rows = await prisma.$queryRawUnsafe<{ rolname: string; tabela: string; privilegio: string }[]>(`
      SELECT grantee AS rolname, table_name AS tabela, privilege_type AS privilegio
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'service_role')
    `);

    expect(rows).toEqual([]);
  });

  it("zero sequences com qualquer privilégio pra anon/authenticated/service_role", async () => {
    const roles = await existingSupabaseRoles();
    if (roles.length === 0) return;

    const rows = await prisma.$queryRawUnsafe<{ rolname: string; sequence: string; privilegio: string }[]>(`
      SELECT grantee AS rolname, object_name AS sequence, privilege_type AS privilegio
      FROM information_schema.role_usage_grants
      WHERE object_schema = 'public' AND object_type = 'SEQUENCE'
        AND grantee IN ('anon', 'authenticated', 'service_role')
    `);

    expect(rows).toEqual([]);
  });

  it("zero funções com EXECUTE pra anon/authenticated/service_role (exceto o esperado — nenhuma hoje)", async () => {
    const roles = await existingSupabaseRoles();
    if (roles.length === 0) return;

    const rows = await prisma.$queryRawUnsafe<{ rolname: string; funcao: string }[]>(`
      SELECT r.rolname, p.proname AS funcao
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated', 'service_role')
      WHERE n.nspname = 'public'
        AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
    `);

    expect(rows).toEqual([]);
  });

  it("PUBLIC (qualquer role, presente ou futura) não tem USAGE no schema public", async () => {
    // `has_schema_privilege` não aceita o pseudo-role PUBLIC como argumento
    // de role — a entrada de PUBLIC num ACL aparece com `grantee = 0` via
    // `aclexplode`, não um nome de role de verdade.
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT count(*)::bigint AS count
      FROM pg_namespace n, aclexplode(n.nspacl) a
      WHERE n.nspname = 'public' AND a.grantee = 0 AND a.privilege_type = 'USAGE'
    `);
    expect(Number(rows[0]?.count ?? -1)).toBe(0);
  });

  it("app_user continua com acesso normal — a correção não afetou a role da aplicação", async () => {
    const rows = await prisma.$queryRawUnsafe<{ has_usage: boolean }[]>(
      `SELECT has_schema_privilege('app_user', 'public', 'USAGE') AS has_usage`,
    );
    expect(rows[0]?.has_usage).toBe(true);
  });

  it("uma tabela nova, criada pela mesma role que aplica as migrations, nasce SEM grant pra anon/authenticated/service_role — prova que a entrada de default privilege de supabase_admin (fora do nosso alcance) é inerte pra tabelas que este projeto realmente cria", async () => {
    const roles = await existingSupabaseRoles();
    if (roles.length === 0) return;

    // `prisma` conecta como `app_user` (sem privilégio de CREATE no schema
    // — de propósito, desde a Etapa 2.5). Esta checagem específica precisa
    // da role que de fato roda as migrations (a mesma que o Prisma CLI usa
    // via DIRECT_URL), não da role de runtime da aplicação.
    const migrationClient = new Client({ connectionString: process.env.DIRECT_URL });
    await migrationClient.connect();
    const tableName = `_teste_default_privilege_${Date.now()}`;
    try {
      await migrationClient.query(`CREATE TABLE "${tableName}" (id uuid PRIMARY KEY)`);
      const { rows } = await migrationClient.query<{ grantee: string }>(
        `SELECT grantee FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = $1
           AND grantee IN ('anon', 'authenticated', 'service_role')`,
        [tableName],
      );
      expect(rows).toEqual([]);
    } finally {
      await migrationClient.query(`DROP TABLE IF EXISTS "${tableName}"`);
      await migrationClient.end();
    }
  });
});
