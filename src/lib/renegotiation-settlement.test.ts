import { describe, expect, it } from "vitest";
import { calculateRenegotiationSettlement } from "./renegotiation-settlement";

describe("calculateRenegotiationSettlement", () => {
  it("sem desconto: valor final é principal + encargos cheios", () => {
    const result = calculateRenegotiationSettlement({
      consolidatedPrincipal: 120000,
      consolidatedCharges: 3200,
      chargesDiscountPercent: 0,
    });
    expect(result.chargesDiscountAmount).toBe(0);
    expect(result.finalValue).toBe(123200);
  });

  it("desconto de 50% sobre os encargos, principal intocado", () => {
    const result = calculateRenegotiationSettlement({
      consolidatedPrincipal: 120000,
      consolidatedCharges: 3200,
      chargesDiscountPercent: 50,
    });
    expect(result.chargesDiscountAmount).toBe(1600);
    // 120000 + 3200 - 1600 = 121600
    expect(result.finalValue).toBe(121600);
  });

  it("desconto de 100% zera os encargos mas nunca desconta o principal", () => {
    const result = calculateRenegotiationSettlement({
      consolidatedPrincipal: 120000,
      consolidatedCharges: 3200,
      chargesDiscountPercent: 100,
    });
    expect(result.chargesDiscountAmount).toBe(3200);
    expect(result.finalValue).toBe(120000);
  });

  it("arredonda pra centavos em valores com dízima", () => {
    const result = calculateRenegotiationSettlement({
      consolidatedPrincipal: 41333.33,
      consolidatedCharges: 799.995,
      chargesDiscountPercent: 33.333,
    });
    // 799.995 -> round2 = 800.00 (arredondamento de entrada já esperado)
    expect(result.consolidatedCharges).toBe(800);
    // 800 * 33.333% = 266.664 -> 266.66
    expect(result.chargesDiscountAmount).toBe(266.66);
  });
});
