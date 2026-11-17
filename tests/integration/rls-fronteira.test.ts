import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { RlsFixtureBuilder } from "./helpers/rls-fixtures";

/**
 * RLS Etapa 4 — fronteira entre organizações, TABELA POR TABELA, nas 84
 * tabelas dos 17 grupos (prisma/rls-etapa4/manifest.json).
 *
 * Só roda com RLS_ETAPA4_ENABLED=1 (job `test-rls` do CI, depois de
 * scripts/rls-apply-etapa4.mjs). Sem a variável, aparece como "skipped".
 *
 * Testa as POLICIES no banco, direto como app_user (DATABASE_URL), com o
 * contexto definido do mesmo jeito que a extensão do Prisma define
 * (set_config(..., true) dentro da transação). Fixtures pela role de
 * migrations (helpers/rls-fixtures.ts), uma linha da Org A e uma da Org B por
 * tabela, com toda a cadeia de pais na mesma organização — então Tier 2 e 3
 * são testados pelo caminho indireto de verdade.
 *
 * Para cada tabela, no contexto da Org A:
 *   leitura  — vê a linha da A, nunca a da B (e o simétrico no contexto da B);
 *   update   — 0 linhas na da B; 1 na da A (controle positivo);
 *   delete   — 0 linhas na da B; 1 na da A (desfeito);
 *   escrita  — inserir linha que aponta para a B: recusado (42501);
 *              mover a linha da A para a B: recusado (42501);
 *   fail-closed — sem contexto, e com o placeholder: zero linhas.
 */
const ENABLED = process.env.RLS_ETAPA4_ENABLED === "1";
const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

type ManifestGroup = { group: number; title: string; tables: { table: string; tier: number; path: string }[] };
const manifest: ManifestGroup[] = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../prisma/rls-etapa4/manifest.json"), "utf8"),
);

let admin: Client;
let app: Client;
let fx: RlsFixtureBuilder;

/** Roda `fn` como app_user numa transação com o contexto `org` (ou sem contexto nenhum), sempre desfeita. */
async function asApp<T>(org: string | null, fn: (c: Client) => Promise<T>): Promise<T> {
  await app.query("BEGIN");
  try {
    if (org !== null) await app.query(`SELECT set_config('app.current_org_id', $1, true)`, [org]);
    return await fn(app);
  } finally {
    await app.query("ROLLBACK");
  }
}

async function expectRlsRefusal(org: string, sql: string, params: unknown[]) {
  const error = await asApp(org, (c) => c.query(sql, params).then(() => null, (e: { code?: string; message?: string }) => e));
  expect(error, `esperava recusa do RLS para: ${sql}`).not.toBeNull();
  expect(error?.code, error?.message).toBe("42501");
}

describe.skipIf(!ENABLED)("RLS Etapa 4 — fronteira entre organizações (84 tabelas)", () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: process.env.DIRECT_URL });
    app = new Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    await app.connect();
    fx = new RlsFixtureBuilder(admin);
    await fx.load();
  });

  afterAll(async () => {
    await admin?.end();
    await app?.end();
  });

  afterEach(async () => {
    await fx.cleanup();
  });

  it("as 84 tabelas dos 17 grupos estão com RLS ligado + FORCE, e uma única policy `tenant_isolation` para app_user", async () => {
    const tables = manifest.flatMap((g) => g.tables.map((t) => t.table));
    expect(tables).toHaveLength(84);
    const { rows } = await admin.query<{ relname: string; rls: boolean; force: boolean; policies: string[] }>(
      `SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS force,
              coalesce(array_agg(p.polname || ':' || pg_get_userbyid(r.r)) FILTER (WHERE p.polname IS NOT NULL), '{}') AS policies
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
         LEFT JOIN pg_policy p ON p.polrelid = c.oid
         LEFT JOIN LATERAL unnest(p.polroles) r(r) ON true
        WHERE c.relname = ANY($1)
        GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity`,
      [tables],
    );
    expect(rows).toHaveLength(84);
    const wrong = rows.filter((r) => !r.rls || !r.force || r.policies.length !== 1 || r.policies[0] !== "tenant_isolation:app_user");
    expect(wrong).toEqual([]);
  });

  for (const group of manifest) {
    describe(`Grupo ${group.group} — ${group.title}`, () => {
      for (const { table, tier, path: policyPath } of group.tables) {
        it(`${table} (Tier ${tier}: ${policyPath}) — leitura, update, delete, escrita e fail-closed`, async () => {
          const orgA = await fx.organization(`Org A — fronteira ${table}`);
          const orgB = await fx.organization(`Org B — fronteira ${table}`);
          const rowA = await fx.insert(table, orgA);
          const rowB = await fx.insert(table, orgB);
          const ids = [rowA, rowB];
          const visible = (org: string | null) =>
            asApp(org, (c) => c.query<{ id: string }>(`SELECT id FROM public."${table}" WHERE id = ANY($1::uuid[])`, [ids]).then((r) => r.rows.map((x) => x.id)));

          // leitura
          expect(await visible(orgA)).toEqual([rowA]);
          expect(await visible(orgB)).toEqual([rowB]);

          // update / delete (sempre desfeitos)
          const count = (org: string, sql: string, id: string) => asApp(org, (c) => c.query(sql, [id]).then((r) => r.rowCount));
          expect(await count(orgA, `UPDATE public."${table}" SET id = id WHERE id = $1`, rowB)).toBe(0);
          expect(await count(orgA, `UPDATE public."${table}" SET id = id WHERE id = $1`, rowA)).toBe(1);
          expect(await count(orgA, `DELETE FROM public."${table}" WHERE id = $1`, rowB)).toBe(0);
          expect(await count(orgA, `DELETE FROM public."${table}" WHERE id = $1`, rowA)).toBe(1);

          // escrita: a coluna do caminho da policy apontando para a Org B
          const pathColumn = tier === 1 ? "organizationId" : policyPath.split("→")[0].trim();
          const { rows: bRows } = await admin.query<Record<string, unknown>>(`SELECT * FROM public."${table}" WHERE id = $1`, [rowB]);
          const bValue = bRows[0][pathColumn];
          // mover a linha da A para a B
          await expectRlsRefusal(orgA, `UPDATE public."${table}" SET "${pathColumn}" = $1 WHERE id = $2`, [bValue, rowA]);
          // inserir uma linha nova da B estando no contexto da A (cópia da linha da B, id novo)
          const copy = Object.fromEntries(Object.entries(bRows[0]).filter(([, v]) => v !== null));
          copy.id = crypto.randomUUID();
          const cols = Object.keys(copy);
          await expectRlsRefusal(
            orgA,
            `INSERT INTO public."${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
            cols.map((c) => (typeof copy[c] === "object" && !(copy[c] instanceof Date) && !Array.isArray(copy[c]) ? JSON.stringify(copy[c]) : copy[c])),
          );

          // fail-closed
          expect(await visible(null)).toEqual([]);
          expect(await visible(PLACEHOLDER)).toEqual([]);
        });
      }
    });
  }
});

describe.skipIf(!ENABLED)("RLS Etapa 4 — reversão de cada grupo", () => {
  it("o .down.sql de cada grupo desliga exatamente as tabelas do grupo, e nada mais (transação desfeita)", async () => {
    const db = new Client({ connectionString: process.env.DIRECT_URL });
    await db.connect();
    const dir = path.resolve(__dirname, "../../prisma/rls-etapa4");
    const all = manifest.flatMap((g) => g.tables.map((t) => t.table));
    try {
      for (const group of manifest) {
        await db.query("BEGIN");
        try {
          await db.query(readFileSync(path.join(dir, `${(group as unknown as { file: string }).file}.down.sql`), "utf8"));
          const { rows } = await db.query<{ relname: string; rls: boolean; policies: number }>(
            `SELECT c.relname, c.relrowsecurity AS rls, (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
               FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
              WHERE c.relname = ANY($1)`,
            [all],
          );
          const mine = new Set(group.tables.map((t) => t.table));
          const off = rows.filter((r) => !r.rls && r.policies === 0).map((r) => r.relname).sort();
          expect(off, `reversão do grupo ${group.group}`).toEqual([...mine].sort());
        } finally {
          await db.query("ROLLBACK");
        }
      }
    } finally {
      await db.end();
    }
  });
});
