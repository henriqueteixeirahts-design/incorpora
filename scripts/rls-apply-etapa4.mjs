#!/usr/bin/env node
// RLS Etapa 4 — aplica (ou reverte) os grupos de prisma/rls-etapa4/ num banco
// DESCARTÁVEL (CI, Docker local), como a role de migrations (DIRECT_URL).
//
//   node scripts/rls-apply-etapa4.mjs              # 00 + grupos 1..17
//   node scripts/rls-apply-etapa4.mjs --upto 5     # 00 + grupos 1..5
//   node scripts/rls-apply-etapa4.mjs --down       # reverte 17..1 + 00
//
// Recusa o banco de produção. Em produção, os grupos entram como migration,
// um por deploy (scripts/rls-promote-group.mjs) — nunca por este script.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "prisma", "rls-etapa4");
const PRODUCTION_REF = "mueudgyivnqhhbwkykkq";

const url = process.env.DIRECT_URL;
if (!url) throw new Error("DIRECT_URL ausente");
if (url.includes(PRODUCTION_REF)) {
  console.error("Recusado: DIRECT_URL aponta para o projeto de produção. Em produção, use scripts/rls-promote-group.mjs (um grupo por deploy).");
  process.exit(1);
}

const args = process.argv.slice(2);
const down = args.includes("--down");
const uptoIndex = args.indexOf("--upto");
const upto = uptoIndex >= 0 ? Number(args[uptoIndex + 1]) : 17;

const manifest = JSON.parse(readFileSync(path.join(DIR, "manifest.json"), "utf8"));
const groups = manifest.filter((g) => g.group <= upto);
const steps = down
  ? [...groups].reverse().map((g) => `${g.file}.down.sql`).concat(upto === 17 ? ["00_funcao_contexto.down.sql"] : [])
  : ["00_funcao_contexto.up.sql", ...groups.map((g) => `${g.file}.up.sql`)];

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  for (const file of steps) {
    const started = Date.now();
    await client.query("BEGIN");
    await client.query(readFileSync(path.join(DIR, file), "utf8"));
    await client.query("COMMIT");
    console.log(`aplicado ${file} (${Date.now() - started} ms)`);
  }
  const { rows } = await client.query(
    `SELECT count(*) FILTER (WHERE c.relrowsecurity)::int AS rls_on, count(*)::int AS total
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'`,
  );
  console.log(`tabelas do schema public com RLS ligado: ${rows[0].rls_on}/${rows[0].total}`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
