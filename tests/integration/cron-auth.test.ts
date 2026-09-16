import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RLS Pilar 2, Etapa 3, item 4 — confirma que as 5 rotas `/api/cron/*`
 * continuam fail-closed no guard de `CRON_SECRET`, sem exceção. Isso não
 * muda com a Etapa 3 (é autenticação HTTP da rota, ortogonal a qual role o
 * job usa depois de autenticado) — mas a partir desta etapa uma rota sem
 * esse guard teria um raio de alcance maior (acesso cross-tenant real via
 * `list_active_org_ids()`), então vale existir um teste de verdade, não só
 * a leitura do código.
 *
 * `@/server/jobs` é mockado inteiro — este teste prova só o guard de
 * autenticação da rota, não executa nenhum job de verdade (isso já é
 * coberto por tests/integration/jobs.test.ts).
 */

vi.mock("@/server/jobs", () => {
  const fakeJob = { name: "fake-job" };
  return {
    runJobForAllOrganizations: vi.fn().mockResolvedValue([]),
    recalculateInstallmentsJob: fakeJob,
    auditUpdateJob: fakeJob,
    auditUpdateFullJob: fakeJob,
    syncIndexValuesJob: fakeJob,
    expireReservationsJob: fakeJob,
  };
});

const ROUTES = [
  { name: "audit-update", path: "@/app/api/cron/audit-update/route" },
  { name: "audit-update-full", path: "@/app/api/cron/audit-update-full/route" },
  { name: "expire-reservations", path: "@/app/api/cron/expire-reservations/route" },
  { name: "recalculate-installments", path: "@/app/api/cron/recalculate-installments/route" },
  { name: "sync-index-values", path: "@/app/api/cron/sync-index-values/route" },
] as const;

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "segredo-de-teste";
});

afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  vi.clearAllMocks();
});

describe.each(ROUTES)("Guard de CRON_SECRET — /api/cron/$name", ({ path }) => {
  it("401 sem header de autorização", async () => {
    const { GET } = await import(/* @vite-ignore */ path);
    const request = new NextRequest("http://localhost/api/cron/route");
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("401 com secret errado", async () => {
    const { GET } = await import(/* @vite-ignore */ path);
    const request = new NextRequest("http://localhost/api/cron/route", {
      headers: { authorization: "Bearer secret-errado" },
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("200 com secret certo", async () => {
    const { GET } = await import(/* @vite-ignore */ path);
    const request = new NextRequest("http://localhost/api/cron/route", {
      headers: { authorization: "Bearer segredo-de-teste" },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});

describe("Guard de CRON_SECRET — falha fechada quando a env var não está configurada", () => {
  it("401 mesmo com o header certo, se CRON_SECRET não estiver setado no ambiente", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("@/app/api/cron/audit-update/route");
    const request = new NextRequest("http://localhost/api/cron/route", {
      headers: { authorization: "Bearer qualquer-coisa" },
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
