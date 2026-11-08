import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeQueryWithoutOrg, resetRlsObserveForTests } from "./rls-observe";

const ORG = "11111111-1111-1111-1111-111111111111";

describe("rls-observe — semana de observação da Etapa 4 (só registra, nunca bloqueia)", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetRlsObserveForTests();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    warn.mockRestore();
  });

  it("desligada por padrão: sem RLS_OBSERVE=1 não registra nada", () => {
    observeQueryWithoutOrg("Customer", "findMany", null);
    expect(warn).not.toHaveBeenCalled();
  });

  it("ligada: registra consulta a tabela protegida sem organização no contexto, uma vez por (model, operação, ponto de chamada)", () => {
    vi.stubEnv("RLS_OBSERVE", "1");
    observeQueryWithoutOrg("Customer", "findMany", null);
    observeQueryWithoutOrg("Customer", "findMany", null);
    observeQueryWithoutOrg("Customer", "create", null);

    expect(warn).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(warn.mock.calls[0][0]));
    expect(first).toMatchObject({ event: "rls-observe-no-org", model: "Customer", operation: "findMany" });
    expect(typeof first.callSite).toBe("string");
  });

  it("ligada: com organização no contexto, não registra", () => {
    vi.stubEnv("RLS_OBSERVE", "1");
    observeQueryWithoutOrg("Customer", "findMany", ORG);
    expect(warn).not.toHaveBeenCalled();
  });

  it("ligada: exceções do inventário e SQL bruto (sem model) ficam de fora", () => {
    vi.stubEnv("RLS_OBSERVE", "1");
    for (const model of ["Organization", "User", "Permission", "Role", "RolePermission", "JobRun"]) {
      observeQueryWithoutOrg(model, "findMany", null);
    }
    observeQueryWithoutOrg(undefined, "$queryRaw", null);
    expect(warn).not.toHaveBeenCalled();
  });
});
