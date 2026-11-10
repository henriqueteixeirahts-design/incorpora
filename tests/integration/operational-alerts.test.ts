import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GLOBAL_CLIENT_IN_TRANSACTION_EVENT, prisma } from "@/lib/prisma";
import {
  OPERATIONAL_ALERT_CAP_PER_DAY,
  OPERATIONAL_ALERT_OVERFLOW_CALL_SITE,
  createOperationalAlertRecorder,
} from "@/lib/operational-alerts";
import { LOGIN_ORG_RESOLUTION_FAILED_EVENT, resolveLoginOrganization } from "@/server/login-organization";
import { dispatchPendingJobAlerts, type DispatchDb } from "../../supabase/functions/job-alert-dispatch/dispatch";
import { fixturePrisma } from "./helpers/tenant";

/**
 * Alertas operacionais gravados no banco (2026-11-10) — ver
 * src/lib/operational-alerts.ts. Os dois eventos viram linha em `job_runs`
 * (`alerta:<evento>`), que a corrente do alerta entrega. Três travas:
 * cliente base (sem recursão), disparar e esquecer (falha não quebra o
 * fluxo), deduplicação + teto.
 *
 * A gravação só acontece em produção — os testes simulam com
 * vi.stubEnv("NODE_ENV", "production"). Cada teste usa um ponto de chamada
 * próprio, porque o gravador real deduplica em memória durante o processo.
 */
type AlertRow = { jobName: string; status: string; triggeredBy: string; organizationId: string | null; summary: { event: string; callSite: string }; error: string; alertSentAt: Date | null };

let app: Client;

async function alertRows(jobName: string): Promise<AlertRow[]> {
  return fixturePrisma().$queryRawUnsafe<AlertRow[]>(
    `SELECT "jobName", status::text, "triggeredBy"::text AS "triggeredBy", "organizationId", summary, error, "alertSentAt"
       FROM job_runs WHERE "jobName" = $1 ORDER BY "startedAt"`,
    jobName,
  );
}

async function waitForRows(jobName: string, atLeast: number, timeoutMs = 3000): Promise<AlertRow[]> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const rows = await alertRows(jobName);
    if (rows.length >= atLeast || Date.now() > until) return rows;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Execução direta como app_user, sem a extensão do Prisma — o equivalente do cliente base, para os gravadores de teste. */
function appExecute(sql: string, ...params: unknown[]) {
  return app.query(sql, params).then((r) => r.rowCount ?? 0);
}

beforeAll(async () => {
  app = new Client({ connectionString: process.env.DATABASE_URL });
  await app.connect();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await fixturePrisma().$executeRawUnsafe(`DELETE FROM job_runs WHERE "jobName" LIKE 'alerta:%'`);
});

afterAll(async () => {
  await app.end();
});

describe("Alertas operacionais — os dois eventos viram linha na corrente do alerta", () => {
  it("fora de produção não grava nada (a trava lança erro e o login só registra no console)", async () => {
    await expect(prisma.$transaction(async () => prisma.unit.count())).rejects.toThrow(/Cliente prisma GLOBAL/);
    await new Promise((r) => setTimeout(r, 200));
    const mine = (await alertRows(`alerta:${GLOBAL_CLIENT_IN_TRANSACTION_EVENT}`)).filter((r) => r.summary.callSite.startsWith("Unit.count"));
    expect(mine).toEqual([]);
  });

  it("evento 1 — prisma global dentro de transação, em produção: a consulta segue E aparece 1 linha FAILURE pendente de alerta", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(prisma.$transaction(async () => prisma.customer.count())).resolves.toBeTypeOf("number");
    const rows = await waitForRows(`alerta:${GLOBAL_CLIENT_IN_TRANSACTION_EVENT}`, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "FAILURE", triggeredBy: "EVENT", organizationId: null, alertSentAt: null });
    expect(rows[0].summary.event).toBe(GLOBAL_CLIENT_IN_TRANSACTION_EVENT);
    expect(rows[0].summary.callSite).toMatch(/^Customer\.count @ /);
    expect(rows[0].error).toMatch(/Cliente prisma GLOBAL usado dentro de prisma\.\$transaction \(Customer\.count\)/);
  });

  it("evento 2 — login com vínculo e organização nula, em produção: o login devolve RESOLUTION_FAILED E aparece 1 linha", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const db = fixturePrisma();
    const org = await db.organization.create({ data: { name: "Org — alerta de login" } });
    const role = await db.role.create({ data: { organizationId: org.id, name: `Papel ${crypto.randomUUID()}` } });
    const user = await db.user.create({ data: { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@teste.local`, fullName: "Login" } });
    await db.accessGrant.create({ data: { organizationId: org.id, userId: user.id, roleId: role.id } });
    try {
      const result = await resolveLoginOrganization(user.id, { resolve: async () => null, logError: () => {} });
      expect(result).toEqual({ status: "RESOLUTION_FAILED", grantCount: 1 });
      const rows = await waitForRows(`alerta:${LOGIN_ORG_RESOLUTION_FAILED_EVENT}`, 1);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "FAILURE", triggeredBy: "EVENT", organizationId: null, alertSentAt: null });
      expect(rows[0].summary.callSite).toBe(`user:${user.id}`);
      expect(rows[0].error).toContain(user.id);
    } finally {
      await db.accessGrant.deleteMany({ where: { userId: user.id } });
      await db.user.deleteMany({ where: { id: user.id } });
      await db.role.deleteMany({ where: { id: role.id } });
      await db.organization.deleteMany({ where: { id: org.id } });
    }
  });
});

describe("Trava 1 — a gravação sai pelo cliente base: sem recursão", () => {
  it("a trava dispara UMA vez e grava UMA linha — a própria gravação (feita ainda dentro do callback da transação) não volta a disparar a trava", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await prisma.$transaction(async () => prisma.supplier.count());
    const rows = await waitForRows(`alerta:${GLOBAL_CLIENT_IN_TRANSACTION_EVENT}`, 1);
    await new Promise((r) => setTimeout(r, 300)); // deixa uma eventual recursão aparecer
    const guardLogs = spy.mock.calls.filter((c) => String(c[0]).includes(GLOBAL_CLIENT_IN_TRANSACTION_EVENT));
    expect(guardLogs).toHaveLength(1);
    const after = await alertRows(`alerta:${GLOBAL_CLIENT_IN_TRANSACTION_EVENT}`);
    expect(after).toHaveLength(1);
    expect(rows[0].summary.callSite).toMatch(/^Supplier\.count @ /);
    expect(after.some((r) => r.summary.callSite.includes("$executeRawUnsafe"))).toBe(false);
  });
});

describe("Trava 2 — disparar e esquecer: falha de gravação não quebra o fluxo", () => {
  it("sem permissão de INSERT em job_runs: a consulta e o login seguem normais, nenhuma linha, e a falha vira console.error", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fixturePrisma();
    const org = await db.organization.create({ data: { name: "Org — alerta sem permissão" } });
    const role = await db.role.create({ data: { organizationId: org.id, name: `Papel ${crypto.randomUUID()}` } });
    const user = await db.user.create({ data: { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@teste.local`, fullName: "Login" } });
    await db.accessGrant.create({ data: { organizationId: org.id, userId: user.id, roleId: role.id } });
    await db.$executeRawUnsafe(`REVOKE INSERT ON job_runs FROM app_user`);
    try {
      await expect(prisma.$transaction(async () => prisma.costCenter.count())).resolves.toBeTypeOf("number");
      await expect(resolveLoginOrganization(user.id, { resolve: async () => null, logError: () => {} })).resolves.toEqual({
        status: "RESOLUTION_FAILED",
        grantCount: 1,
      });
      await new Promise((r) => setTimeout(r, 500));
      expect(await alertRows(`alerta:${GLOBAL_CLIENT_IN_TRANSACTION_EVENT}`)).toEqual([]);
      expect(await alertRows(`alerta:${LOGIN_ORG_RESOLUTION_FAILED_EVENT}`)).toEqual([]);
      const writeFailures = spy.mock.calls.filter((c) => String(c[0]).includes("operational-alert-write-failed"));
      expect(writeFailures.length).toBe(2);
    } finally {
      await db.$executeRawUnsafe(`GRANT INSERT ON job_runs TO app_user`);
      await db.accessGrant.deleteMany({ where: { userId: user.id } });
      await db.user.deleteMany({ where: { id: user.id } });
      await db.role.deleteMany({ where: { id: role.id } });
      await db.organization.deleteMany({ where: { id: org.id } });
    }
  });

  it("gravador cuja execução lança (síncrona ou assíncrona) nunca rejeita", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const throwsSync = createOperationalAlertRecorder(() => {
      throw new Error("boom");
    }, { enabled: () => true });
    const rejects = createOperationalAlertRecorder(() => Promise.reject(new Error("boom")), { enabled: () => true });
    await expect(throwsSync("teste", "x", "m")).resolves.toBeUndefined();
    await expect(rejects("teste", "x", "m")).resolves.toBeUndefined();
  });
});

describe("Trava 3 — deduplicação e teto", () => {
  it("10 mil ocorrências no MESMO ponto de chamada viram 1 linha (e 1 ida ao banco)", async () => {
    let calls = 0;
    const record = createOperationalAlertRecorder((sql, ...p) => {
      calls++;
      return appExecute(sql, ...p);
    }, { enabled: () => true });
    for (let i = 0; i < 10_000; i++) void record("teste-dedup", "server/x.ts:10", "ocorrência");
    await record("teste-dedup", "server/x.ts:10", "ocorrência");
    await new Promise((r) => setTimeout(r, 300));
    expect(await alertRows("alerta:teste-dedup")).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it(`10 mil ocorrências em pontos DISTINTOS viram ${OPERATIONAL_ALERT_CAP_PER_DAY} linhas + 1 de teto atingido`, async () => {
    let calls = 0;
    const record = createOperationalAlertRecorder((sql, ...p) => {
      calls++;
      return appExecute(sql, ...p);
    }, { enabled: () => true });
    const writes: Promise<void>[] = [];
    for (let i = 0; i < 10_000; i++) writes.push(record("teste-teto", `server/x.ts:${i}`, "ocorrência"));
    await Promise.all(writes);
    const rows = await alertRows("alerta:teste-teto");
    expect(rows).toHaveLength(OPERATIONAL_ALERT_CAP_PER_DAY + 1);
    expect(rows.filter((r) => r.summary.callSite === OPERATIONAL_ALERT_OVERFLOW_CALL_SITE)).toHaveLength(1);
    expect(rows.find((r) => r.summary.callSite === OPERATIONAL_ALERT_OVERFLOW_CALL_SITE)?.error).toMatch(/Teto de 20 pontos/);
    expect(calls).toBeLessThanOrEqual(OPERATIONAL_ALERT_CAP_PER_DAY + 2);
  });

  it("dois processos (gravadores separados): o banco deduplica o mesmo ponto e respeita o teto entre eles", async () => {
    const p1 = createOperationalAlertRecorder(appExecute, { enabled: () => true });
    const p2 = createOperationalAlertRecorder(appExecute, { enabled: () => true });
    await p1("teste-processos", "server/y.ts:1", "m");
    await p2("teste-processos", "server/y.ts:1", "m");
    expect(await alertRows("alerta:teste-processos")).toHaveLength(1);
    for (let i = 2; i <= OPERATIONAL_ALERT_CAP_PER_DAY; i++) await p1("teste-processos", `server/y.ts:${i}`, "m");
    for (let i = 100; i < 110; i++) await p2("teste-processos", `server/y.ts:${i}`, "m"); // p2 não sabe do teto; o banco sabe
    const rows = await alertRows("alerta:teste-processos");
    expect(rows).toHaveLength(OPERATIONAL_ALERT_CAP_PER_DAY + 1);
    expect(rows.filter((r) => r.summary.callSite === OPERATIONAL_ALERT_OVERFLOW_CALL_SITE)).toHaveLength(1);
  });
});

describe("Chega pela corrente do alerta (Edge Function job-alert-dispatch, código real)", () => {
  it("o alerta gravado pela trava vira exatamente 1 e-mail, e não é reenviado", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await prisma.$transaction(async () => prisma.broker.count());
    const [row] = await waitForRows(`alerta:${GLOBAL_CLIENT_IN_TRANSACTION_EVENT}`, 1);
    expect(row).toBeDefined();
    const { rows: [{ id }] } = await app.query(`SELECT id FROM job_runs WHERE "jobName" = $1`, [`alerta:${GLOBAL_CLIENT_IN_TRANSACTION_EVENT}`]);

    const db: DispatchDb = { query: async (text, params) => (await app.query(text, params)).rows };
    const config = { resendApiKey: "re_test_placeholder", to: "alertas@teste.local", from: "Incorpora <alertas@teste.local>", environmentLabel: "teste" };
    const fetchMock = vi.fn(async () => new Response('{"id":"email_test"}', { status: 200 }));
    const result = await dispatchPendingJobAlerts(db, config, fetchMock as unknown as typeof fetch);
    expect(result.delivered).toContain(id);
    const mine = fetchMock.mock.calls.filter((c) => String((c as unknown as [string, RequestInit])[1].body).includes(id));
    expect(mine).toHaveLength(1);
    const body = JSON.parse(String((mine[0] as unknown as [string, RequestInit])[1].body));
    expect(body.subject).toBe(`[Incorpora (teste)] Job "alerta:${GLOBAL_CLIENT_IN_TRANSACTION_EVENT}" falhou`);
    expect(body.text).toMatch(/Cliente prisma GLOBAL usado dentro de prisma\.\$transaction \(Broker\.count\)/);

    await dispatchPendingJobAlerts(db, config, fetchMock as unknown as typeof fetch);
    expect(fetchMock.mock.calls.filter((c) => String((c as unknown as [string, RequestInit])[1].body).includes(id))).toHaveLength(1);
  });
});
