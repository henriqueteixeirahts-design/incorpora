import { describe, expect, it } from "vitest";
import { resolveUnitArea } from "./unit-area";

describe("resolveUnitArea — prioridade privativa > total > lote (docs/RELATORIO_TESTDRIVE.md achado 22)", () => {
  it("usa privateArea quando presente, mesmo com totalArea e lotArea também preenchidos", () => {
    expect(resolveUnitArea({ privateArea: 80, totalArea: 120, lotArea: 300 })).toBe(80);
  });

  it("cai pra totalArea quando privateArea é null", () => {
    expect(resolveUnitArea({ privateArea: null, totalArea: 120, lotArea: 300 })).toBe(120);
  });

  it("cai pra lotArea quando privateArea e totalArea são null", () => {
    expect(resolveUnitArea({ privateArea: null, totalArea: null, lotArea: 300 })).toBe(300);
  });

  it("retorna null quando nenhum campo de área está preenchido", () => {
    expect(resolveUnitArea({ privateArea: null, totalArea: null, lotArea: null })).toBeNull();
  });
});
