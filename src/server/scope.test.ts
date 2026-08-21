import { describe, it, expect } from "vitest";
import { developmentAccessScope, developmentIdAccessScope, canAccessDevelopment } from "./scope";
import type { AccessContext } from "./auth-context";

/**
 * docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 2.5 — testes de unidade dos
 * primitivos de escopo por empreendimento (a peça central do enforcement).
 * Testes de fronteira de verdade (usuário real, banco real, tentando
 * acessar registro fora do escopo) ficam nos testes de integração por
 * módulo; este arquivo garante que a lógica pura de "ALL vs. Set restrito"
 * está certa antes de aplicá-la em qualquer query.
 */

function makeContext(developmentAccess: AccessContext["developmentAccess"]): AccessContext {
  return {
    userId: "user-1",
    organizationId: "org-1",
    roleNames: [],
    permissions: new Set(),
    developmentAccess,
  };
}

describe("developmentAccessScope", () => {
  it("sem filtro (objeto vazio) quando o acesso é ALL", () => {
    expect(developmentAccessScope(makeContext("ALL"))).toEqual({});
  });

  it("filtra por developmentId quando o acesso é restrito", () => {
    const context = makeContext(new Set(["dev-x", "dev-y"]));
    const scope = developmentAccessScope(context) as { developmentId: { in: string[] } };
    expect(scope.developmentId.in.sort()).toEqual(["dev-x", "dev-y"]);
  });

  it("filtro vazio (nenhum resultado) quando o acesso é um Set vazio", () => {
    const scope = developmentAccessScope(makeContext(new Set())) as { developmentId: { in: string[] } };
    expect(scope.developmentId.in).toEqual([]);
  });
});

describe("developmentIdAccessScope", () => {
  it("sem filtro quando o acesso é ALL", () => {
    expect(developmentIdAccessScope(makeContext("ALL"))).toEqual({});
  });

  it("filtra por id quando o acesso é restrito", () => {
    const scope = developmentIdAccessScope(makeContext(new Set(["dev-x"]))) as { id: { in: string[] } };
    expect(scope.id.in).toEqual(["dev-x"]);
  });
});

describe("canAccessDevelopment", () => {
  it("ALL sempre permite, qualquer developmentId", () => {
    expect(canAccessDevelopment(makeContext("ALL"), "dev-qualquer")).toBe(true);
  });

  it("restrito permite só o(s) developmentId(s) concedido(s)", () => {
    const context = makeContext(new Set(["dev-x"]));
    expect(canAccessDevelopment(context, "dev-x")).toBe(true);
    expect(canAccessDevelopment(context, "dev-y")).toBe(false);
  });

  it("restrito, mas developmentId nulo/ausente (entidade sem empreendimento) — não é bloqueável por esta camada", () => {
    const context = makeContext(new Set(["dev-x"]));
    expect(canAccessDevelopment(context, null)).toBe(true);
    expect(canAccessDevelopment(context, undefined)).toBe(true);
  });

  it("Set vazio (nenhum empreendimento concedido) bloqueia tudo que tem developmentId", () => {
    const context = makeContext(new Set());
    expect(canAccessDevelopment(context, "dev-x")).toBe(false);
  });
});
