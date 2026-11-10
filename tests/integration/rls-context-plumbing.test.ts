import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { setCurrentOrgId } from "@/lib/tenant-context";

/**
 * docs/ESPEC_MULTITENANT_FUNDACOES.md, Pilar 2, Etapa 1 — plumbing do
 * contexto de tenant (AsyncLocalStorage + extensão do Prisma), AINDA sem
 * nenhuma policy de RLS ativa. Este teste prova que `app.current_org_id`
 * chega no banco corretamente por chamada, antes de qualquer tabela
 * depender disso pra isolar dado de verdade.
 */

async function readCurrentOrgSetting(): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<{ current_org: string | null }[]>(
    `SELECT current_setting('app.current_org_id', true) AS current_org`,
  );
  return rows[0]?.current_org ?? null;
}

describe("RLS — plumbing do contexto de tenant (Etapa 1, sem policy ativa ainda)", () => {
  it("setCurrentOrgId reflete no banco via SET LOCAL, numa chamada simples", async () => {
    setCurrentOrgId("11111111-1111-1111-1111-111111111111");
    expect(await readCurrentOrgSetting()).toBe("11111111-1111-1111-1111-111111111111");

    setCurrentOrgId("22222222-2222-2222-2222-222222222222");
    expect(await readCurrentOrgSetting()).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("persiste dentro de um $transaction(async tx => ...) interativo — mesmo padrão usado em quase toda mutação do app", async () => {
    setCurrentOrgId("33333333-3333-3333-3333-333333333333");

    const result = await prisma.$transaction(async (tx) => {
      const first = await tx.$queryRawUnsafe<{ current_org: string | null }[]>(
        `SELECT current_setting('app.current_org_id', true) AS current_org`,
      );
      // uma operação de modelo de verdade no meio, mesmo formato das mutações reais (create + auditoria)
      await tx.organization.count();
      const second = await tx.$queryRawUnsafe<{ current_org: string | null }[]>(
        `SELECT current_setting('app.current_org_id', true) AS current_org`,
      );
      return { first: first[0]?.current_org, second: second[0]?.current_org };
    });

    expect(result.first).toBe("33333333-3333-3333-3333-333333333333");
    expect(result.second).toBe("33333333-3333-3333-3333-333333333333");
  });

  it("uma segunda chamada com organizationId diferente não vaza pra chamada anterior (sem contaminação entre \"requests\" sequenciais)", async () => {
    setCurrentOrgId("44444444-4444-4444-4444-444444444444");
    const first = await readCurrentOrgSetting();

    setCurrentOrgId("55555555-5555-5555-5555-555555555555");
    const second = await readCurrentOrgSetting();

    expect(first).toBe("44444444-4444-4444-4444-444444444444");
    expect(second).toBe("55555555-5555-5555-5555-555555555555");
  });

  it("um throw dentro de $transaction(async tx => ...) desfaz TUDO que já rodou na mesma transação — atomicidade preservada com o SET LOCAL injetado", async () => {
    setCurrentOrgId("66666666-6666-6666-6666-666666666666");

    const marker = `rls-atomicity-check-${Date.now()}`;

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.organization.create({
          data: { name: marker },
        });
        throw new Error("rollback forçado de propósito");
      }),
    ).rejects.toThrow("rollback forçado de propósito");

    const survivors = await prisma.organization.findMany({ where: { name: marker } });
    expect(survivors).toHaveLength(0);
  });
});
