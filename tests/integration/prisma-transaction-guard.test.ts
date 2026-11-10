import { afterEach, describe, expect, it, vi } from "vitest";
import { GLOBAL_CLIENT_IN_TRANSACTION_EVENT, prisma } from "@/lib/prisma";
import { setCurrentOrgId } from "@/lib/tenant-context";
import { fixturePrisma } from "./helpers/tenant";

/**
 * Trava em tempo de execução: cliente `prisma` GLOBAL dentro de
 * `prisma.$transaction` (2026-11-10) — ver src/lib/prisma.ts. Causa raiz do
 * achado da comissão na Etapa 4: a chamada global sai por outra conexão, fora
 * da transação (não vê o que não foi commitado, não participa do rollback) e,
 * antes da correção, sem organização no contexto.
 */
async function readCurrentOrgSetting(): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<{ current_org: string | null }[]>(
    `SELECT current_setting('app.current_org_id', true) AS current_org`,
  );
  return rows[0]?.current_org ?? null;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  // O teste em modo produção grava um alerta em job_runs (ver operational-alerts.test.ts); não deixa resto.
  await new Promise((r) => setTimeout(r, 300));
  await fixturePrisma().$executeRawUnsafe(`DELETE FROM job_runs WHERE "jobName" LIKE 'alerta:%'`);
});

describe("Trava: cliente prisma GLOBAL dentro de prisma.$transaction", () => {
  it("fora de produção, consulta pelo prisma global dentro do callback FALHA com mensagem explícita", async () => {
    await expect(prisma.$transaction(async () => prisma.organization.count())).rejects.toThrow(
      /Cliente prisma GLOBAL usado dentro de prisma\.\$transaction \(Organization\.count\)/,
    );
  });

  it("fora de produção, SQL bruto e $transaction aninhado pelo prisma global também falham", async () => {
    await expect(prisma.$transaction(async () => readCurrentOrgSetting())).rejects.toThrow(/raw\.\$queryRawUnsafe/);
    await expect(prisma.$transaction(async () => prisma.$transaction(async (inner) => inner.organization.count()))).rejects.toThrow(
      /\$transaction aninhado/,
    );
  });

  it("pelo tx, tudo funciona e enxerga o que a própria transação escreveu (o jeito certo)", async () => {
    setCurrentOrgId("33333333-3333-3333-3333-333333333333");
    const seen = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ current_org: string }[]>(`SELECT current_setting('app.current_org_id', true) AS current_org`);
      return rows[0].current_org;
    });
    expect(seen).toBe("33333333-3333-3333-3333-333333333333");
  });

  it("fora da transação, o prisma global segue normal (a trava não dispara)", async () => {
    await expect(prisma.organization.count()).resolves.toBeTypeOf("number");
  });

  it("em PRODUÇÃO, não derruba o caminho: registra o evento e a consulta ainda leva a organização do contexto (fail-closed preservado)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    setCurrentOrgId("77777777-7777-7777-7777-777777777777");
    const seenInside = await prisma.$transaction(async () => readCurrentOrgSetting());
    expect(seenInside).toBe("77777777-7777-7777-7777-777777777777");
    expect(spy).toHaveBeenCalled();
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ event: GLOBAL_CLIENT_IN_TRANSACTION_EVENT, level: "error" });
  });
});
