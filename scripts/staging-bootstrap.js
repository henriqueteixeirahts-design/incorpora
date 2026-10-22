// Reconstrói a staging do RLS (`incorpora-staging-rls`) DO ZERO, por replay
// completo das migrations via `prisma migrate deploy` — com
// `_prisma_migrations` real, igual a produção — mais o seed mínimo
// (prisma/seed.ts: organização padrão, catálogo de permissões, papéis).
//
// Por que existe (docs/STATUS_IMPLANTACAO.md, 2026-10-22): a staging antiga
// não tinha `_prisma_migrations` — as migrations tinham sido aplicadas por
// outro caminho (apply_migration do Supabase MCP), com versões diferentes
// das do repo, então ela não provava paridade com o repo. Staging passa a
// ser descartável e reconstruível a qualquer momento, em vez de um estado a
// preservar (pause/restore do plano Free já se mostrou não confiável).
//
// Uso (credenciais SÓ em .env.staging, ignorado pelo git — nunca na linha
// de comando nem no repo):
//
//   STAGING_DIRECT_URL=postgresql://postgres.<ref>:<senha>@<host>:5432/postgres
//   STAGING_APP_USER_PASSWORD=<senha nova pro app_user da staging>
//   STAGING_DATABASE_URL=postgresql://app_user.<ref>:<mesma senha>@<host>:5432/postgres   (só p/ --mutation-test)
//
//   node scripts/staging-bootstrap.js --confirm-reset     # apaga e reconstrói
//   node scripts/staging-bootstrap.js --verify            # só confere, não muda nada
//   node scripts/staging-bootstrap.js --mutation-test     # roda contra a staging os testes de mutação da V3/V6 e o despacho de alerta
//
// Travas: recusa rodar se a URL não for do projeto de staging, e SEMPRE
// recusa se for do projeto de produção. O reset exige --confirm-reset.
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { Client } = require("pg");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env.staging"), override: true });

const STAGING_PROJECT_REF = process.env.STAGING_PROJECT_REF ?? "itfndszaryokngxomfxv";
const PRODUCTION_PROJECT_REF = "mueudgyivnqhhbwkykkq";
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "prisma", "migrations");

function fail(message) {
  console.error(`\n[staging-bootstrap] ERRO: ${message}`);
  process.exit(1);
}

function requireStagingUrl(name) {
  const url = process.env[name];
  if (!url) fail(`${name} ausente em .env.staging.`);
  if (url.includes(PRODUCTION_PROJECT_REF)) fail(`${name} aponta pro projeto de PRODUÇÃO (${PRODUCTION_PROJECT_REF}). Abortado.`);
  if (!url.includes(STAGING_PROJECT_REF)) fail(`${name} não é do projeto de staging (${STAGING_PROJECT_REF}). Abortado.`);
  return url;
}

function run(command, args, env) {
  console.log(`\n[staging-bootstrap] $ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } });
  if (result.status !== 0) fail(`"${command} ${args.join(" ")}" saiu com código ${result.status}.`);
}

function repoMigrationNames() {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function withClient(url, fn) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function reset(directUrl) {
  await withClient(directUrl, async (client) => {
    const before = await client.query(
      `SELECT current_database() AS db, (SELECT count(*) FROM pg_tables WHERE schemaname = 'public')::int AS tables`,
    );
    console.log(`[staging-bootstrap] antes do reset: banco ${before.rows[0].db}, ${before.rows[0].tables} tabelas em public`);

    await client.query("BEGIN");
    // Watchdog do pg_cron referencia job_runs — desagenda antes de derrubar o
    // schema; a migration 20260918193000 reagenda no replay.
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
          IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'job-run-watchdog') THEN
            PERFORM cron.unschedule('job-run-watchdog');
          END IF;
          IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'job-alert-dispatch') THEN
            PERFORM cron.unschedule('job-alert-dispatch');
          END IF;
        END IF;
      END $$;`);
    // Schema `ops` (despacho de alerta, migration 20261022160000) também é
    // recriado pelo replay.
    await client.query("DROP SCHEMA IF EXISTS ops CASCADE");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    // app_user é role do cluster (sobrevive ao DROP SCHEMA) e a migration da
    // Etapa 2.5 faz CREATE ROLE sem IF NOT EXISTS — precisa sumir pro replay
    // recriá-la exatamente como versionada.
    const appUser = await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'app_user'`);
    if (appUser.rowCount > 0) {
      await client.query("DROP OWNED BY app_user");
      await client.query("DROP ROLE app_user");
    }
    // Histórico do caminho antigo (apply_migration do MCP) — removido pra não
    // confundir com o _prisma_migrations real que o replay cria.
    await client.query(`
      DO $$
      BEGIN
        IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
          DELETE FROM supabase_migrations.schema_migrations;
        END IF;
      END $$;`);
    await client.query("COMMIT");
    console.log("[staging-bootstrap] reset concluído (schema public recriado, app_user removida).");
  });
}

/** URL da Edge Function de alerta desta staging, no Vault (a migration 20261022160000 lê de lá). */
async function setAlertDispatchUrl(directUrl) {
  const url = `https://${STAGING_PROJECT_REF}.supabase.co/functions/v1/job-alert-dispatch`;
  await withClient(directUrl, async (client) => {
    const vault = await client.query(`SELECT to_regclass('vault.secrets') AS t`);
    if (!vault.rows[0].t) return;
    const existing = await client.query(`SELECT id FROM vault.secrets WHERE name = 'job_alert_dispatch_url'`);
    if (existing.rowCount > 0) {
      await client.query(`SELECT vault.update_secret($1, $2)`, [existing.rows[0].id, url]);
    } else {
      await client.query(`SELECT vault.create_secret($1, 'job_alert_dispatch_url')`, [url]);
    }
  });
  console.log(`[staging-bootstrap] job_alert_dispatch_url = ${url}`);
}

async function setAppUserLogin(directUrl, password) {
  await withClient(directUrl, async (client) => {
    await client.query(`ALTER ROLE app_user LOGIN PASSWORD ${client.escapeLiteral(password)}`);
  });
  console.log("[staging-bootstrap] app_user com login habilitado (senha de .env.staging).");
}

async function verify(directUrl) {
  const expected = repoMigrationNames();
  const problems = [];
  await withClient(directUrl, async (client) => {
    const table = await client.query(`SELECT to_regclass('public._prisma_migrations') AS t`);
    if (!table.rows[0].t) {
      problems.push("_prisma_migrations não existe");
      return;
    }
    const applied = await client.query(
      `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`,
    );
    const appliedNames = applied.rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
    const missing = expected.filter((name) => !appliedNames.includes(name));
    const extra = appliedNames.filter((name) => !expected.includes(name));
    const broken = applied.rows.filter((r) => !r.finished_at || r.rolled_back_at).map((r) => r.migration_name);
    if (missing.length) problems.push(`faltando: ${missing.join(", ")}`);
    if (extra.length) problems.push(`a mais (fora do repo): ${extra.join(", ")}`);
    if (broken.length) problems.push(`com falha/rollback: ${broken.join(", ")}`);

    const role = await client.query(
      `SELECT rolcanlogin, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'app_user'`,
    );
    if (role.rowCount === 0) problems.push("app_user não existe");
    else if (role.rows[0].rolbypassrls || role.rows[0].rolsuper) problems.push("app_user com BYPASSRLS/superusuário");

    const cron = await client.query(
      `SELECT count(*)::int AS n FROM pg_extension WHERE extname = 'pg_cron'`,
    );
    const watchdog = cron.rows[0].n
      ? (await client.query(`SELECT count(*)::int AS n FROM cron.job WHERE jobname = 'job-run-watchdog' AND active`)).rows[0].n
      : 0;
    if (!watchdog) problems.push("watchdog pg_cron não agendado");
    const dispatch = cron.rows[0].n
      ? (await client.query(`SELECT count(*)::int AS n FROM cron.job WHERE jobname = 'job-alert-dispatch' AND active`)).rows[0].n
      : 0;
    if (!dispatch) problems.push("despacho de alerta (job-alert-dispatch) não agendado");
    const dispatchSecrets = await client.query(
      `SELECT count(*)::int AS n FROM vault.secrets WHERE name IN ('job_alert_dispatch_url', 'job_alert_dispatch_token')`,
    );
    if (dispatchSecrets.rows[0].n !== 2) problems.push("segredos do despacho de alerta ausentes no Vault");

    const org = await client.query(`SELECT count(*)::int AS n FROM organizations`);
    console.log(
      `[staging-bootstrap] verificação: ${appliedNames.length}/${expected.length} migrations do repo aplicadas via _prisma_migrations; ` +
        `app_user login=${role.rows[0]?.rolcanlogin}; watchdog=${watchdog ? "ativo" : "ausente"}; organizações (seed)=${org.rows[0].n}`,
    );
  });
  if (problems.length) fail(`staging NÃO confere com o repo — ${problems.join("; ")}`);
  console.log("[staging-bootstrap] OK — staging confere com o repo.");
}

async function main() {
  const args = new Set(process.argv.slice(2));

  if (args.has("--mutation-test")) {
    const databaseUrl = requireStagingUrl("STAGING_DATABASE_URL");
    const directUrl = requireStagingUrl("STAGING_DIRECT_URL");
    run("npx", [
      "vitest",
      "run",
      "--config",
      "vitest.integration.config.ts",
      "tests/integration/audit-v3-mutation.test.ts",
      "tests/integration/audit-v6-history.test.ts",
      "tests/integration/job-alert-dispatch.test.ts",
      "--reporter=verbose",
    ], {
      DATABASE_URL: databaseUrl,
      DIRECT_URL: directUrl,
      V3_MUTATION_VERBOSE: "1",
    });
    return;
  }

  const directUrl = requireStagingUrl("STAGING_DIRECT_URL");

  if (args.has("--verify")) {
    await verify(directUrl);
    return;
  }

  if (!args.has("--confirm-reset")) {
    fail("o reset APAGA a staging inteira. Rode com --confirm-reset (ou --verify pra só conferir).");
  }
  const appUserPassword = process.env.STAGING_APP_USER_PASSWORD;
  if (!appUserPassword) fail("STAGING_APP_USER_PASSWORD ausente em .env.staging.");

  await reset(directUrl);
  run("npx", ["prisma", "migrate", "deploy"], { DIRECT_URL: directUrl, DATABASE_URL: directUrl });
  await setAppUserLogin(directUrl, appUserPassword);
  await setAlertDispatchUrl(directUrl);
  run("npx", ["prisma", "db", "seed"], { DIRECT_URL: directUrl, DATABASE_URL: directUrl });
  await verify(directUrl);
}

main().catch((error) => fail(error instanceof Error ? error.stack : String(error)));
