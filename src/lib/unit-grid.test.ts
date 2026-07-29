import { describe, expect, it } from "vitest";
import { getUnitColumnKey, groupLotsByBlock, UNASSIGNED_BLOCK } from "./unit-grid";

describe("getUnitColumnKey", () => {
  it("usa os dois últimos dígitos do número quando bate o padrão", () => {
    expect(getUnitColumnKey({ number: "2601" })).toBe("01");
    expect(getUnitColumnKey({ number: "401" })).toBe("01");
  });

  it("cai pra position quando o número não tem 2 dígitos finais", () => {
    expect(getUnitColumnKey({ number: "PH", position: "Nascente" })).toBe("Nascente");
  });

  it("cai pro próprio número quando não há position", () => {
    expect(getUnitColumnKey({ number: "Cobertura" })).toBe("Cobertura");
  });
});

describe("groupLotsByBlock", () => {
  it("agrupa por quadra e ordena quadras e lotes naturalmente (2 antes de 10)", () => {
    const lots = [
      { number: "L10", block: "10" },
      { number: "L2", block: "2" },
      { number: "L1", block: "2" },
      { number: "L23", block: "2" },
    ];

    const grouped = groupLotsByBlock(lots);

    expect(grouped.map(([block]) => block)).toEqual(["2", "10"]);
    expect(grouped[0][1].map((l) => l.number)).toEqual(["L1", "L2", "L23"]);
  });

  it("lotes sem quadra caem no grupo UNASSIGNED_BLOCK", () => {
    const lots = [
      { number: "L01", block: null },
      { number: "L02", block: "1" },
    ];

    const grouped = groupLotsByBlock(lots);

    expect(grouped.map(([block]) => block).sort()).toEqual([UNASSIGNED_BLOCK, "1"].sort());
    expect(grouped.find(([block]) => block === UNASSIGNED_BLOCK)?.[1].map((l) => l.number)).toEqual(["L01"]);
    expect(grouped.find(([block]) => block === "1")?.[1].map((l) => l.number)).toEqual(["L02"]);
  });
});
