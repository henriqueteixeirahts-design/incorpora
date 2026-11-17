import "dotenv/config";
import { readdirSync } from "node:fs";
import path from "node:path";
import { vi } from "vitest";
import { withOrgContext } from "@/lib/tenant-context";

/**
 * RLS Etapa 4 (2026-11-10) — invariante de produção reproduzida no arnês.
 *
 * Em produção, o `AccessContext` só nasce em `getAccessContext()`
 * (src/server/auth-context.ts), que no mesmo passo define o contexto de
 * organização do banco (`setCurrentOrgId`). Logo, toda função de src/server
 * chamada com um `AccessContext` roda com o contexto do banco = a
 * organização desse `AccessContext` (verificado: nenhum código de produção
 * monta `AccessContext` à mão).
 *
 * Os testes montam o `AccessContext` à mão (não há Supabase Auth no CI), então
 * o arnês faz o que o login faz: toda função exportada de src/server, quando
 * recebe um `AccessContext` como primeiro argumento, roda dentro de
 * `withOrgContext(context.organizationId)`.
 *
 * O que isto NÃO esconde:
 *   - jobs (`runJobForAllOrganizations`, `runForOrganization(orgId, ...)`)
 *     não recebem `AccessContext` e passam pelo caminho real de contexto;
 *   - qualquer leitura/escrita de OUTRA organização feita pelo código sob
 *     teste é barrada pelo RLS — é exatamente o que os testes de fronteira
 *     querem ver;
 *   - consulta feita direto pelo teste com `prisma` precisa de contexto
 *     explícito (`aroundEach` / `asOrg` — tests/integration/helpers/tenant.ts).
 * Com RLS desligado, nada disto muda resultado (o contexto é só definido).
 */
function isAccessContext(value: unknown): value is { organizationId: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { organizationId?: unknown }).organizationId === "string" &&
    (value as { permissions?: unknown }).permissions instanceof Set
  );
}

function wrapModule(original: Record<string, unknown>) {
  const wrapped: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(original)) {
    if (typeof value === "function" && !/^[A-Z]/.test(name)) {
      const fn = value as (...args: unknown[]) => unknown;
      wrapped[name] = (...args: unknown[]) =>
        isAccessContext(args[0]) ? withOrgContext(args[0].organizationId, () => fn(...args)) : fn(...args);
    } else {
      wrapped[name] = value;
    }
  }
  return wrapped;
}

const serverDir = path.resolve(__dirname, "../../src/server");
for (const file of readdirSync(serverDir)) {
  if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
  vi.doMock(`@/server/${file.slice(0, -3)}`, async (importOriginal) => wrapModule(await importOriginal<Record<string, unknown>>()));
}
