import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { SUPABASE_ROLES, supabaseRolesRequired } from "./helpers/supabase-roles";

/**
 * O serviço Postgres do CI usa a imagem `supabase/postgres` (mesma versão
 * da produção) desde 2026-11-09 — no lugar do `postgres:17` puro, onde as
 * roles do Supabase não existiam e as travas "nenhuma role do PostgREST
 * consegue X" passavam vazias. Estes testes provam que o ambiente é de fato
 * o do Supabase e que as travas acusam de verdade.
 *
 * Só rodam com EXPECT_SUPABASE_ROLES=1 (CI). Num Postgres puro local
 * aparecem como "skipped" — visível, nunca um verde vazio.
 */
const required = supabaseRolesRequired();

describe.skipIf(!required)("Ambiente Supabase do CI (imagem supabase/postgres)", () => {
  it("as 3 roles do PostgREST existem", async () => {
    const rows = await prisma.$queryRawUnsafe<{ rolname: string }[]>(
      `SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') ORDER BY rolname`,
    );
    expect(rows.map((r) => r.rolname)).toEqual([...SUPABASE_ROLES].sort());
  });

  it("a role de migration (DIRECT_URL) não é superusuária — igual à produção, onde `postgres` também não é", async () => {
    const client = new Client({ connectionString: process.env.DIRECT_URL });
    await client.connect();
    try {
      const { rows } = await client.query<{ rolname: string; rolsuper: boolean }>(
        `SELECT rolname, rolsuper FROM pg_roles WHERE rolname = current_user`,
      );
      expect(rows[0]?.rolname).toBe("postgres");
      expect(rows[0]?.rolsuper).toBe(false);
    } finally {
      await client.end();
    }
  });

  it("app_user (DATABASE_URL, usada pelos testes) não é superusuária nem tem BYPASSRLS", async () => {
    const rows = await prisma.$queryRawUnsafe<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]>(
      `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    expect(rows[0]).toEqual({ rolname: "app_user", rolsuper: false, rolbypassrls: false });
  });

  it("o watchdog do pg_cron foi agendado pela migration (no postgres:17 puro a guarda o pulava em silêncio)", async () => {
    const client = new Client({ connectionString: process.env.DIRECT_URL });
    await client.connect();
    try {
      const { rows } = await client.query<{ schedule: string; command: string }>(
        `SELECT schedule, command FROM cron.job WHERE jobname = 'job-run-watchdog'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].schedule).toBe("*/15 * * * *");
      expect(rows[0].command).toContain("UPDATE job_runs");
    } finally {
      await client.end();
    }
  });

  it("mutação: se anon ganhar EXECUTE em resolve_user_organization(), a checagem acusa (a trava não é vazia)", async () => {
    // Feito como a role dona da função, dentro de uma transação desfeita no
    // fim — o banco termina exatamente como começou.
    const client = new Client({ connectionString: process.env.DIRECT_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("GRANT EXECUTE ON FUNCTION resolve_user_organization(uuid) TO anon");
      const { rows } = await client.query<{ rolname: string; has_execute: boolean }>(
        `SELECT r.rolname, has_function_privilege(r.rolname, 'resolve_user_organization(uuid)', 'EXECUTE') AS has_execute
           FROM pg_roles r
          WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
          ORDER BY r.rolname`,
      );
      expect(rows).toEqual([
        { rolname: "anon", has_execute: true },
        { rolname: "authenticated", has_execute: false },
        { rolname: "service_role", has_execute: false },
      ]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("mutação: uma tabela nova com GRANT pra authenticated aparece na checagem de privilégios", async () => {
    const client = new Client({ connectionString: process.env.DIRECT_URL });
    await client.connect();
    const tableName = `_teste_mutacao_grant_${Date.now()}`;
    try {
      await client.query("BEGIN");
      await client.query(`CREATE TABLE "${tableName}" (id uuid PRIMARY KEY)`);
      await client.query(`GRANT USAGE ON SCHEMA public TO authenticated`);
      await client.query(`GRANT SELECT ON "${tableName}" TO authenticated`);
      const { rows } = await client.query<{ grantee: string; privilege_type: string }>(
        `SELECT grantee, privilege_type FROM information_schema.role_table_grants
          WHERE table_schema = 'public' AND table_name = $1
            AND grantee IN ('anon', 'authenticated', 'service_role')`,
        [tableName],
      );
      expect(rows).toEqual([{ grantee: "authenticated", privilege_type: "SELECT" }]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
