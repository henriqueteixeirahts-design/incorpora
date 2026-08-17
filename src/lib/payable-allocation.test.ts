import { describe, expect, it } from "vitest";
import { computeAllocationAmountsFromPercent, resolvePayableDestinations } from "./payable-allocation";

describe("computeAllocationAmountsFromPercent", () => {
  it("divide um valor exato sem sobra", () => {
    const result = computeAllocationAmountsFromPercent(1000, [
      { developmentId: "a", percent: 50 },
      { developmentId: "b", percent: 30 },
      { developmentId: null, percent: 20 },
    ]);
    expect(result.map((r) => r.amount)).toEqual([500, 300, 200]);
    expect(result.reduce((acc, r) => acc + r.amount, 0)).toBe(1000);
  });

  it("absorve a sobra de arredondamento no último destino (soma sempre fecha exata)", () => {
    // 100 / 3 = 33.333... — cada terço arredondado individualmente não fecharia 100.
    const result = computeAllocationAmountsFromPercent(100, [
      { developmentId: "a", percent: 33.33 },
      { developmentId: "b", percent: 33.33 },
      { developmentId: "c", percent: 33.34 },
    ]);
    const sum = result.reduce((acc, r) => acc + r.amount, 0);
    expect(sum).toBe(100);
    expect(result[0].amount).toBe(33.33);
    expect(result[1].amount).toBe(33.33);
    expect(result[2].amount).toBe(33.34);
  });

  it("um único destino de 100% recebe o valor total inteiro", () => {
    const result = computeAllocationAmountsFromPercent(1234.56, [{ developmentId: "a", percent: 100 }]);
    expect(result).toEqual([{ developmentId: "a", percent: 100, amount: 1234.56 }]);
  });
});

describe("resolvePayableDestinations", () => {
  it("sem rateio configurado, cai no destino único (developmentId da própria Payable)", () => {
    const result = resolvePayableDestinations({ amount: 500, developmentId: "dev-1", allocations: [] });
    expect(result).toEqual([{ developmentId: "dev-1", amount: 500 }]);
  });

  it("sem rateio e sem developmentId, cai em Organização (nulo)", () => {
    const result = resolvePayableDestinations({ amount: 500, developmentId: null, allocations: [] });
    expect(result).toEqual([{ developmentId: null, amount: 500 }]);
  });

  it("com rateio configurado, usa os destinos rateados (nunca o valor cheio duplicado)", () => {
    const result = resolvePayableDestinations({
      amount: 1000,
      developmentId: "dev-1",
      allocations: [
        { developmentId: "dev-1", amount: 600 },
        { developmentId: "dev-2", amount: 400 },
      ],
    });
    expect(result).toEqual([
      { developmentId: "dev-1", amount: 600 },
      { developmentId: "dev-2", amount: 400 },
    ]);
    expect(result.reduce((acc, r) => acc + r.amount, 0)).toBe(1000);
  });
});
