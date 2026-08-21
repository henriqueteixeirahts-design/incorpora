import { describe, expect, it } from "vitest";
import { resolveAgencySplit } from "./agency-split-tiers";

/**
 * docs/ESPEC_CORRETOR_COMISSIONAMENTO.md — casos de teste obrigatórios 2 e
 * 3 (split 5-vias com/sem gerente direto). Função pura, sem banco.
 */

const FIVE_WAY_TIERS = [
  { label: "Corretor", percent: 20, kind: "DYNAMIC_BROKER_OF_SALE" as const, fixedBrokerId: null },
  { label: "Gerente direto", percent: 10, kind: "DYNAMIC_MANAGER_OF_BROKER" as const, fixedBrokerId: null },
  { label: "Gerente de produto", percent: 5, kind: "FIXED_BROKER" as const, fixedBrokerId: "manager-produto" },
  { label: "Gerente regional", percent: 5, kind: "FIXED_BROKER" as const, fixedBrokerId: "manager-regional" },
  { label: "Imobiliária", percent: 60, kind: "FIXED_AGENCY" as const, fixedBrokerId: null },
];

describe("resolveAgencySplit — corretor COM gerente direto (caso 2)", () => {
  it("resolve 5 destinatários, soma 100%", () => {
    const resolved = resolveAgencySplit(FIVE_WAY_TIERS, "agency-1", "broker-joao", "manager-carlos");

    expect(resolved).toHaveLength(5);
    expect(resolved.reduce((acc, r) => acc + r.percent, 0)).toBe(100);

    const brokerRow = resolved.find((r) => r.kind === "DYNAMIC_BROKER_OF_SALE")!;
    expect(brokerRow.percent).toBe(20);
    expect(brokerRow.brokerId).toBe("broker-joao");

    const managerRow = resolved.find((r) => r.kind === "DYNAMIC_MANAGER_OF_BROKER")!;
    expect(managerRow.percent).toBe(10);
    expect(managerRow.brokerId).toBe("manager-carlos");

    const agencyRow = resolved.find((r) => r.kind === "FIXED_AGENCY")!;
    expect(agencyRow.percent).toBe(60);
    expect(agencyRow.agencyId).toBe("agency-1");
  });
});

describe("resolveAgencySplit — corretor SEM gerente direto (caso-limite, caso 3)", () => {
  it("a fatia do gerente direto soma na do corretor; 4 destinatários", () => {
    const resolved = resolveAgencySplit(FIVE_WAY_TIERS, "agency-1", "broker-joao", null);

    expect(resolved).toHaveLength(4);
    expect(resolved.reduce((acc, r) => acc + r.percent, 0)).toBe(100);

    const brokerRow = resolved.find((r) => r.kind === "DYNAMIC_BROKER_OF_SALE")!;
    expect(brokerRow.percent).toBe(30); // 20 (próprio) + 10 (gerente, sem destinatário)
    expect(brokerRow.brokerId).toBe("broker-joao");

    expect(resolved.some((r) => r.kind === "DYNAMIC_MANAGER_OF_BROKER")).toBe(false);
  });
});

describe("resolveAgencySplit — autônomo (caso 1)", () => {
  it("fatia única de 100% pro corretor", () => {
    const resolved = resolveAgencySplit(
      [{ label: "Corretor autônomo", percent: 100, kind: "DYNAMIC_BROKER_OF_SALE", fixedBrokerId: null }],
      "agency-irrelevant",
      "broker-solo",
      null,
    );

    expect(resolved).toEqual([
      { label: "Corretor autônomo", percent: 100, kind: "DYNAMIC_BROKER_OF_SALE", brokerId: "broker-solo", agencyId: null },
    ]);
  });
});
