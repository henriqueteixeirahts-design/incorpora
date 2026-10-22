import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { dispatchPendingJobAlerts, type DispatchConfig, type DispatchDb } from "../../supabase/functions/job-alert-dispatch/dispatch";

/**
 * Alerta de falha de job independente da Vercel (decisão de 2026-10-22).
 *
 * Este arquivo NÃO importa nada da aplicação Next.js (nem src/server, nem
 * rotas, nem o cron da Vercel): só o SQL que o pg_cron executa e o código
 * que a Edge Function `job-alert-dispatch` executa. É a prova de que, com a
 * Vercel inteira parada, um job travado ainda vira e-mail:
 *   job travado (RUNNING) → watchdog pg_cron fecha como FAILURE →
 *   GitHub Actions chama a Edge Function → dispatch entrega via Resend.
 * O Resend é substituído por um `fetch` falso.
 *
 * E de que nada disso precisa de pg_net (recusado em 2026-10-22 — ver
 * docs/STATUS_IMPLANTACAO.md): o banco onde roda não tem pg_net, e o teste
 * falha se alguém instalar.
 */

const config: DispatchConfig = {
  resendApiKey: "re_test_placeholder",
  to: "alertas@teste.local",
  from: "Incorpora <alertas@teste.local>",
  environmentLabel: "teste",
};

let client: Client;
let db: DispatchDb;
let orgId: string;

beforeAll(async () => {
  client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  db = { query: async (text, params) => (await client.query(text, params)).rows };
  const org = await client.query(`INSERT INTO organizations (id, name, "updatedAt") VALUES (gen_random_uuid(), 'Org — Alerta Edge Function', now()) RETURNING id`);
  orgId = org.rows[0].id;
});

afterAll(async () => {
  await client.query(`DELETE FROM job_runs WHERE "organizationId" = $1`, [orgId]);
  await client.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
  await client.end();
});

/** Mesmo UPDATE que o job `job-run-watchdog` do pg_cron executa a cada 15 min (migration 20260918193000). */
async function runPgCronWatchdogSql() {
  await client.query(`
    UPDATE job_runs
    SET status = 'FAILURE',
        "finishedAt" = now(),
        error = 'Execução travada — sem atualização de status há mais de 10 minutos (watchdog pg_cron, backstop independente do runtime da aplicação).'
    WHERE status = 'RUNNING' AND "startedAt" < now() - interval '10 minutes';
  `);
}

async function insertJobRun(fields: { jobName: string; status: "RUNNING" | "FAILURE"; minutesAgo: number; error?: string; alertSuppressed?: boolean }) {
  const result = await client.query(
    `INSERT INTO job_runs (id, "jobName", "organizationId", status, "triggeredBy", "startedAt", error, "alertSuppressed")
     VALUES (gen_random_uuid(), $1, $2, $3, 'CRON', now() - make_interval(mins => $4), $5, $6) RETURNING id`,
    [fields.jobName, orgId, fields.status, fields.minutesAgo, fields.error ?? null, fields.alertSuppressed ?? false],
  );
  return result.rows[0].id as string;
}

async function alertSentAt(id: string) {
  return (await client.query(`SELECT "alertSentAt" FROM job_runs WHERE id = $1`, [id])).rows[0].alertSentAt as Date | null;
}

function fakeResend(status: number) {
  return vi.fn(async () => new Response(status === 200 ? '{"id":"email_test"}' : "erro", { status }));
}

function callsFor(fetchMock: ReturnType<typeof fakeResend>, jobRunId: string) {
  return fetchMock.mock.calls.filter((call) => String((call as unknown as [string, RequestInit])[1].body).includes(jobRunId));
}

describe("Alerta de job — sem pg_net", () => {
  it("banco sem pg_net: a extensão e o schema `net` não existem, e o job travado ainda vira alerta", async () => {
    const pgNet = await client.query(`SELECT count(*)::int AS n FROM pg_extension WHERE extname = 'pg_net'`);
    expect(pgNet.rows[0].n).toBe(0);
    const netSchema = await client.query(`SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = 'net'`);
    expect(netSchema.rows[0].n).toBe(0);

    const stuck = await insertJobRun({ jobName: "recalculate-installments", status: "RUNNING", minutesAgo: 30 });
    await runPgCronWatchdogSql();
    const fetchMock = fakeResend(200);
    await dispatchPendingJobAlerts(db, config, fetchMock as unknown as typeof fetch);
    expect(callsFor(fetchMock, stuck)).toHaveLength(1);
  });

  it("nenhuma migration do repo instala pg_net", () => {
    const migrationsDir = path.resolve(__dirname, "../../prisma/migrations");
    const offenders = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => {
        const sql = fs.readFileSync(path.join(migrationsDir, entry.name, "migration.sql"), "utf8");
        return /create\s+extension[^;]*pg_net/i.test(sql);
      })
      .map((entry) => entry.name);
    expect(offenders).toEqual([]);
  });

  it("o workflow do GitHub Actions é agendado, lê o token de um secret e falha em qualquer resposta que não seja 200", () => {
    const workflow = fs.readFileSync(path.resolve(__dirname, "../../.github/workflows/job-alert-dispatch.yml"), "utf8");
    expect(workflow).toMatch(/schedule:\s*\n\s*- cron: "5,20,35,50 \* \* \* \*"/);
    expect(workflow).toContain("${{ secrets.JOB_ALERT_DISPATCH_TOKEN }}");
    expect(workflow).toMatch(/if \[ "\$\{status\}" != "200" \]; then[\s\S]*?exit 1/);
    expect(workflow).not.toMatch(/Bearer [A-Za-z0-9]{16,}/); // token nunca escrito no repo
  });
});

describe("Alerta de job — despacho pela Edge Function, independente da Vercel", () => {
  it("Vercel parada: job travado → watchdog pg_cron → despacho → exatamente 1 e-mail, sem reenvio", async () => {
    const stuck = await insertJobRun({ jobName: "recalculate-installments", status: "RUNNING", minutesAgo: 20 });

    await runPgCronWatchdogSql();
    expect((await client.query(`SELECT status FROM job_runs WHERE id = $1`, [stuck])).rows[0].status).toBe("FAILURE");

    const fetchMock = fakeResend(200);
    const result = await dispatchPendingJobAlerts(db, config, fetchMock as unknown as typeof fetch);
    expect(result.delivered).toContain(stuck);

    const calls = callsFor(fetchMock, stuck);
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init.body));
    expect(body.subject).toBe('[Incorpora (teste)] Job "recalculate-installments" falhou');
    expect(body.text).toContain("watchdog pg_cron");
    expect(await alertSentAt(stuck)).not.toBeNull();

    await dispatchPendingJobAlerts(db, config, fetchMock as unknown as typeof fetch);
    expect(callsFor(fetchMock, stuck)).toHaveLength(1);
  });

  it("duas invocações simultâneas não duplicam o e-mail", async () => {
    const failed = await insertJobRun({ jobName: "sync-index-values", status: "FAILURE", minutesAgo: 1, error: "boom" });
    const fetchMock = fakeResend(200);

    await Promise.all([
      dispatchPendingJobAlerts(db, config, fetchMock as unknown as typeof fetch),
      dispatchPendingJobAlerts(db, config, fetchMock as unknown as typeof fetch),
    ]);
    expect(callsFor(fetchMock, failed)).toHaveLength(1);
  });

  it("entrega recusada pelo Resend (HTTP 500) continua pendente e sai na próxima rodada", async () => {
    const failed = await insertJobRun({ jobName: "audit-update", status: "FAILURE", minutesAgo: 1, error: "ALERT" });

    const refused = fakeResend(500);
    const first = await dispatchPendingJobAlerts(db, config, refused as unknown as typeof fetch);
    expect(first.failed).toContainEqual({ jobRunId: failed, reason: "resend_http_500" });
    expect(await alertSentAt(failed)).toBeNull();

    const accepted = fakeResend(200);
    await dispatchPendingJobAlerts(db, config, accepted as unknown as typeof fetch);
    expect(callsFor(accepted, failed)).toHaveLength(1);
    expect(await alertSentAt(failed)).not.toBeNull();
  });

  it("sem chave/destinatário configurados, não chama o Resend e não dá nada como entregue", async () => {
    const failed = await insertJobRun({ jobName: "expire-reservations", status: "FAILURE", minutesAgo: 1, error: "boom" });
    const fetchMock = fakeResend(200);

    const result = await dispatchPendingJobAlerts(db, { ...config, resendApiKey: undefined }, fetchMock as unknown as typeof fetch);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.failed).toContainEqual({ jobRunId: failed, reason: "missing_email_config" });
    expect(await alertSentAt(failed)).toBeNull();

    // Limpa pra não vazar como pendente pros outros testes.
    await client.query(`UPDATE job_runs SET "alertSuppressed" = true WHERE id = $1`, [failed]);
  });

  it("falha anterior ao controle de entrega (alertSuppressed) nunca é enviada", async () => {
    const historical = await insertJobRun({ jobName: "recalculate-installments", status: "FAILURE", minutesAgo: 60 * 24 * 50, error: "travou em 2026-09-02", alertSuppressed: true });
    const fetchMock = fakeResend(200);

    await dispatchPendingJobAlerts(db, config, fetchMock as unknown as typeof fetch);
    expect(callsFor(fetchMock, historical)).toHaveLength(0);
  });
});
