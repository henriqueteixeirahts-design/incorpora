import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { recordOperationalAlert } from "@/lib/prisma";
import { withOrgContext } from "@/lib/tenant-context";
import { runAuditForOrganization, ALERT_DISPATCH_HEARTBEAT_JOB } from "@/server/audit";
import { LOGIN_ORG_RESOLUTION_FAILED_EVENT, resolveLoginOrganization } from "@/server/login-organization";
import { fixturePrisma } from "./helpers/tenant";

/**
 * RLS em `job_runs` — PRÉ-REQUISITOS BLOQUEANTES (2026-11-16).
 *
 * `job_runs` é uma das 6 exceções do inventário, mas VAI receber policy:
 * "policy por organização + leitura cross-org só via função dedicada ou pelo
 * postgres" (docs/RLS_INVENTARIO_TIERS.md). Duas coisas da aplicação dependem
 * de linhas SEM organização em `job_runs`, como `app_user`, sem contexto:
 *   1. a gravação dos alertas operacionais (src/lib/operational-alerts.ts);
 *   2. a leitura do batimento do despacho pela auditoria V7.
 * Com a policy por organização, as duas quebram EM SILÊNCIO: a gravação é
 * "disparar e esquecer" (o alerta some) e a V7 vira ALERT permanente.
 *
 * Este arquivo liga a policy PLANEJADA (só durante os testes, no banco do
 * job test-rls) e afirma o ESTADO ATUAL com precisão — cada afirmação com o
 * controle embutido (sem a policy, a mesma ação funciona), para não ser um
 * teste vazio. Quando o caminho próprio existir (proposta em
 * docs/RLS_ETAPA4_ROTEIRO_ATIVACAO.md, seção 2.1), estes testes FALHAM e
 * viram os testes positivos — é o que impede descobrir o problema pelo
 * silêncio. Só roda com RLS_ETAPA4_ENABLED=1 (precisa de app_current_org_id()).
 */
const ENABLED = process.env.RLS_ETAPA4_ENABLED === "1";

let admin: Client;

async function policyOn() {
  await admin.query(`ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY`);
  await admin.query(`ALTER TABLE public.job_runs FORCE ROW LEVEL SECURITY`);
  await admin.query(`DROP POLICY IF EXISTS tenant_isolation_planejada ON public.job_runs`);
  await admin.query(`CREATE POLICY tenant_isolation_planejada ON public.job_runs AS PERMISSIVE FOR ALL TO app_user
                       USING ("organizationId" = (SELECT public.app_current_org_id()))
                       WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()))`);
}

async function policyOff() {
  await admin.query(`DROP POLICY IF EXISTS tenant_isolation_planejada ON public.job_runs`);
  await admin.query(`ALTER TABLE public.job_runs NO FORCE ROW LEVEL SECURITY`);
  await admin.query(`ALTER TABLE public.job_runs DISABLE ROW LEVEL SECURITY`);
}

async function loginFailureFor(userTag: string) {
  const db = fixturePrisma();
  const org = await db.organization.create({ data: { name: `Org — job_runs RLS ${userTag}` } });
  const role = await db.role.create({ data: { organizationId: org.id, name: `Papel ${crypto.randomUUID()}` } });
  const user = await db.user.create({ data: { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@teste.local`, fullName: "Login" } });
  await db.accessGrant.create({ data: { organizationId: org.id, userId: user.id, roleId: role.id } });
  const cleanup = async () => {
    await db.accessGrant.deleteMany({ where: { userId: user.id } });
    await db.user.deleteMany({ where: { id: user.id } });
    await db.role.deleteMany({ where: { id: role.id } });
    await db.organization.deleteMany({ where: { id: org.id } });
  };
  return { userId: user.id, cleanup };
}

async function alertRowsFor(callSite: string) {
  const { rows } = await admin.query(`SELECT id FROM job_runs WHERE "jobName" = $1 AND summary ->> 'callSite' = $2`, [
    `alerta:${LOGIN_ORG_RESOLUTION_FAILED_EVENT}`,
    callSite,
  ]);
  return rows;
}

describe.skipIf(!ENABLED)("RLS em job_runs — pré-requisitos bloqueantes ainda ABERTOS (estado atual afirmado)", () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: process.env.DIRECT_URL });
    await admin.connect();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await policyOff();
    await admin.query(`DELETE FROM job_runs WHERE "jobName" LIKE 'alerta:%'`);
  });

  afterAll(async () => {
    await policyOff();
    await admin?.end();
  });

  it("BLOQUEANTE 1 — gravação de alerta: com a policy por organização, o alerta de login é RECUSADO e some em silêncio; sem a policy, o mesmo alerta aparece (controle)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Controle: policy desligada → a linha aparece.
    const control = await loginFailureFor("controle");
    try {
      await expect(resolveLoginOrganization(control.userId, { resolve: async () => null, logError: () => {} })).resolves.toMatchObject({
        status: "RESOLUTION_FAILED",
      });
      await new Promise((r) => setTimeout(r, 400));
      expect(await alertRowsFor(`user:${control.userId}`)).toHaveLength(1);
    } finally {
      await control.cleanup();
    }

    // Policy planejada ligada → o login segue (disparar e esquecer), mas NENHUMA linha, e a única pista é um console.error.
    await policyOn();
    const blocked = await loginFailureFor("bloqueado");
    try {
      await expect(resolveLoginOrganization(blocked.userId, { resolve: async () => null, logError: () => {} })).resolves.toMatchObject({
        status: "RESOLUTION_FAILED",
      });
      await new Promise((r) => setTimeout(r, 400));
      await policyOff();
      expect(await alertRowsFor(`user:${blocked.userId}`)).toEqual([]);
      const writeFailures = spy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("operational-alert-write-failed"));
      expect(writeFailures.some((m) => /row-level security/.test(m))).toBe(true);
    } finally {
      await blocked.cleanup();
    }
  });

  it("BLOQUEANTE 1 — o mesmo vale para o gravador direto (qualquer evento): com a policy, 0 linhas; sem a policy, 1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const site = `teste:${crypto.randomUUID()}`;
    await policyOn();
    await recordOperationalAlert(LOGIN_ORG_RESOLUTION_FAILED_EVENT, `${site}:com-policy`, "m");
    await policyOff();
    await recordOperationalAlert(LOGIN_ORG_RESOLUTION_FAILED_EVENT, `${site}:sem-policy`, "m");
    expect(await alertRowsFor(`${site}:com-policy`)).toEqual([]);
    expect(await alertRowsFor(`${site}:sem-policy`)).toHaveLength(1);
  });

  it("BLOQUEANTE 2 — auditoria V7: com batimento SUCCESS de agora, a V7 fica OK sem a policy (controle) e vira ALERT com a policy (não enxerga linha sem organização)", async () => {
    const db = fixturePrisma();
    const org = await db.organization.create({ data: { name: "Org — V7 com job_runs RLS" } });
    const beat = await db.jobRun.create({
      data: { jobName: ALERT_DISPATCH_HEARTBEAT_JOB, organizationId: null, status: "SUCCESS", triggeredBy: "CRON", finishedAt: new Date() },
    });
    const v7 = async () => {
      const result = await withOrgContext(org.id, () => runAuditForOrganization(org.id, { triggeredBy: "MANUAL" }));
      return result.checks.find((c) => c.code === "V7_ALERT_DISPATCH_HEARTBEAT")!.status;
    };
    try {
      expect(await v7()).toBe("OK");
      await policyOn();
      expect(await v7()).toBe("ALERT");
    } finally {
      await policyOff();
      await db.auditCheckResult.deleteMany({ where: { auditRun: { organizationId: org.id } } });
      await db.auditRun.deleteMany({ where: { organizationId: org.id } });
      await db.jobRun.deleteMany({ where: { OR: [{ id: beat.id }, { organizationId: org.id }] } });
      await db.organization.deleteMany({ where: { id: org.id } });
    }
  });
});
