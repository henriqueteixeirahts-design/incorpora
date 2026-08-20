import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Incidente de produção (2026-08-20): a migration `audit_run_sequence_tiebreaker`
 * foi aplicada no banco local e no Postgres efêmero do CI (que sempre roda
 * `prisma migrate deploy` do zero), mas NUNCA no banco real de produção —
 * não havia nenhum passo de migração no pipeline de build da Vercel. O
 * schema ficou "adiantado" em relação a produção, sem nenhum teste capaz de
 * pegar isso (CI não tem acesso ao banco de produção, e nunca deveria ter).
 * A causa raiz não era um bug de lógica — era a ausência de uma trava
 * estrutural garantindo que produção nunca fica pra trás. A trava: rodar
 * `prisma migrate deploy` como parte do próprio build de produção, pra todo
 * deploy se auto-curar de qualquer schema drift. Este teste garante que
 * ninguém remove essa trava sem perceber (ex.: numa limpeza de scripts).
 */
describe("Pipeline de deploy — migração aplicada antes do build", () => {
  it("o script de build roda `prisma migrate deploy` antes de `next build`", () => {
    const packageJson = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf-8"));
    const buildScript: string = packageJson.scripts.build;

    expect(buildScript).toContain("prisma migrate deploy");
    expect(buildScript.indexOf("prisma migrate deploy")).toBeLessThan(buildScript.indexOf("next build"));
  });
});
