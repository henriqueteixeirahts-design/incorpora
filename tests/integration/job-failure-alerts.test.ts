import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { deliverPendingFailureAlerts } from "@/server/jobs";

/**
 * Entrega do alerta de falha de job (src/server/jobs.ts,
 * deliverPendingFailureAlerts). O caso que importa: job travado de verdade
 * — o watchdog pg_cron (migration 20260918193000) fecha o JobRun como
 * FAILURE em SQL puro, sem alerta, ANTES da aplicação ver. Antes do
 * controle de entrega (migration 20261022120000), isso nunca gerava e-mail.
 * O Resend nunca é chamado de verdade aqui — `fetch` é substituído.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_test_placeholder");
  vi.stubEnv("JOB_ALERT_EMAIL_TO", "alertas@teste.local");
  vi.stubEnv("JOB_ALERT_EMAIL_FROM", "Incorpora <alertas@teste.local>");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function makeOrg(name: string) {
  return prisma.organization.create({ data: { name } });
}

/** Mesmo UPDATE que o job `job-run-watchdog` do pg_cron executa a cada 15 min. */
async function runPgCronWatchdogSql() {
  await prisma.$executeRawUnsafe(`
    UPDATE job_runs
    SET status = 'FAILURE',
        "finishedAt" = now(),
        error = 'Execução travada — sem atualização de status há mais de 10 minutos (watchdog pg_cron, backstop independente do runtime da aplicação).'
    WHERE status = 'RUNNING' AND "startedAt" < now() - interval '10 minutes';
  `);
}

function alertCallsFor(jobRunId: string) {
  return fetchMock.mock.calls.filter(([, init]) => String((init as RequestInit).body).includes(jobRunId));
}

describe("Alerta de falha de job — entrega controlada", () => {
  it("job travado fechado pelo watchdog pg_cron gera alerta na próxima varredura, uma vez só", async () => {
    const org = await makeOrg("Org — Alerta pg_cron");
    try {
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
      const stuck = await prisma.jobRun.create({
        data: {
          jobName: "recalculate-installments",
          organizationId: org.id,
          triggeredBy: "CRON",
          status: "RUNNING",
          startedAt: new Date(Date.now() - 20 * 60 * 1000),
        },
      });

      await runPgCronWatchdogSql();
      expect((await prisma.jobRun.findUniqueOrThrow({ where: { id: stuck.id } })).status).toBe("FAILURE");

      await deliverPendingFailureAlerts();
      const calls = alertCallsFor(stuck.id);
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe("https://api.resend.com/emails");
      const body = JSON.parse(String((calls[0][1] as RequestInit).body));
      expect(body.subject).toContain("recalculate-installments");
      expect(body.text).toContain("watchdog pg_cron");
      expect((await prisma.jobRun.findUniqueOrThrow({ where: { id: stuck.id } })).alertSentAt).not.toBeNull();

      await deliverPendingFailureAlerts();
      expect(alertCallsFor(stuck.id)).toHaveLength(1); // não reenvia
    } finally {
      await prisma.jobRun.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
  });

  it("entrega que falha (HTTP 500 do Resend) continua pendente e é tentada de novo", async () => {
    const org = await makeOrg("Org — Alerta reenvio");
    try {
      const failed = await prisma.jobRun.create({
        data: { jobName: "sync-index-values", organizationId: org.id, triggeredBy: "CRON", status: "FAILURE", error: "boom", finishedAt: new Date() },
      });

      fetchMock.mockResolvedValue(new Response("erro", { status: 500 }));
      await deliverPendingFailureAlerts();
      expect(alertCallsFor(failed.id)).toHaveLength(1);
      expect((await prisma.jobRun.findUniqueOrThrow({ where: { id: failed.id } })).alertSentAt).toBeNull();

      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
      await deliverPendingFailureAlerts();
      expect(alertCallsFor(failed.id)).toHaveLength(2);
      expect((await prisma.jobRun.findUniqueOrThrow({ where: { id: failed.id } })).alertSentAt).not.toBeNull();
    } finally {
      await prisma.jobRun.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
  });

  it("sem canal configurado, não chama o Resend e não dá o alerta como entregue", async () => {
    const org = await makeOrg("Org — Alerta sem canal");
    try {
      vi.stubEnv("RESEND_API_KEY", "");
      const failed = await prisma.jobRun.create({
        data: { jobName: "audit-update", organizationId: org.id, triggeredBy: "CRON", status: "FAILURE", error: "ALERT", finishedAt: new Date() },
      });

      await deliverPendingFailureAlerts();
      expect(alertCallsFor(failed.id)).toHaveLength(0);
      expect((await prisma.jobRun.findUniqueOrThrow({ where: { id: failed.id } })).alertSentAt).toBeNull();
    } finally {
      await prisma.jobRun.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
  });

  it("falha anterior ao controle (alertSuppressed) nunca é reenviada", async () => {
    const org = await makeOrg("Org — Alerta histórico");
    try {
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
      const historical = await prisma.jobRun.create({
        data: {
          jobName: "recalculate-installments",
          organizationId: org.id,
          triggeredBy: "CRON",
          status: "FAILURE",
          error: "travou em 2026-09-02",
          finishedAt: new Date(),
          alertSuppressed: true,
        },
      });

      await deliverPendingFailureAlerts();
      expect(alertCallsFor(historical.id)).toHaveLength(0);
    } finally {
      await prisma.jobRun.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
  });
});
