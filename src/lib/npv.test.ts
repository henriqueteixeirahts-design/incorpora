import { describe, expect, it } from "vitest";
import { calculateNPV, monthlyRateFromPeriod } from "./npv";

describe("monthlyRateFromPeriod", () => {
  it("taxa mensal passa direto (dividida por 100)", () => {
    expect(monthlyRateFromPeriod(1, "MONTHLY")).toBeCloseTo(0.01, 10);
    expect(monthlyRateFromPeriod(2.5, "MONTHLY")).toBeCloseTo(0.025, 10);
  });

  it("taxa anual convertida pra mensal equivalente — 12 meses compostos volta pra taxa anual", () => {
    // Verificação manual: se i_a = 12%, a taxa mensal equivalente i_m satisfaz
    // (1+i_m)^12 = 1.12 — checagem direta da definição, não da implementação.
    const monthlyRate = monthlyRateFromPeriod(12, "YEARLY");
    const compoundedBack = Math.pow(1 + monthlyRate, 12);
    expect(compoundedBack).toBeCloseTo(1.12, 10);
  });
});

describe("calculateNPV", () => {
  it("sem desconto (taxa 0%), VPL é a soma nominal", () => {
    const npv = calculateNPV(
      [
        { monthsFromBase: 0, amount: 500 },
        { monthsFromBase: 6, amount: 500 },
      ],
      0,
    );
    expect(npv).toBe(1000);
  });

  it("pagamento único — conferido à mão: 101 daqui a 1 mês a 1% a.m. vale exatamente 100 hoje", () => {
    const npv = calculateNPV([{ monthsFromBase: 1, amount: 101 }], 0.01);
    expect(npv).toBe(100);
  });

  it("pagamento em 12 meses com taxa anual equivalente — VPL de 1000 daqui a 1 ano a 12% a.a. é 1000/1.12", () => {
    const monthlyRate = monthlyRateFromPeriod(12, "YEARLY");
    const npv = calculateNPV([{ monthsFromBase: 12, amount: 1000 }], monthlyRate);
    expect(npv).toBeCloseTo(1000 / 1.12, 2);
  });

  it("pagamento no mês 0 não é descontado (fator 1)", () => {
    const npv = calculateNPV([{ monthsFromBase: 0, amount: 1000 }], 0.05);
    expect(npv).toBe(1000);
  });

  it("dois pagamentos — soma dos valores presentes calculados independentemente à mão", () => {
    // 200 no mês 0 (fator 1) + 400 no mês 2 a 2% a.m. (fator 1/1.02^2 = 1/1.0404)
    const npv = calculateNPV(
      [
        { monthsFromBase: 0, amount: 200 },
        { monthsFromBase: 2, amount: 400 },
      ],
      0.02,
    );
    const expected = 200 + 400 / Math.pow(1.02, 2);
    expect(npv).toBeCloseTo(expected, 2);
    expect(npv).toBeCloseTo(200 + 384.47, 1); // 400/1.0404 = 384.4675...
  });
});
