import { describe, it, expect } from "vitest";
import { annualToMonthlyRate, calculateInvestorLoanPosition } from "./loan-balance";

describe("calculateInvestorLoanPosition — tranche única", () => {
  it("juros compostos mensais, sem amortização — bate com (1+r)^n", () => {
    const result = calculateInvestorLoanPosition({
      tranches: [{ id: "t1", principal: 10000, creditDate: new Date(2024, 0, 1) }],
      amortizations: [],
      asOfDate: new Date(2024, 3, 1), // fev, mar, abr = 3 meses
      monthlyInterestPercent: 1,
      interestType: "COMPOUND",
      indexValues: [],
    });
    // 10000 * 1.01^3 = 10303.01
    expect(result.netBalance).toBe(10303.01);
    expect(result.totalAccruedInterest).toBe(303.01);
    expect(result.totalOutstandingPrincipal).toBe(10000);
  });

  it("juros simples, sem amortização — bate com 1+r*n", () => {
    const result = calculateInvestorLoanPosition({
      tranches: [{ id: "t1", principal: 10000, creditDate: new Date(2024, 0, 1) }],
      amortizations: [],
      asOfDate: new Date(2024, 3, 1),
      monthlyInterestPercent: 1,
      interestType: "SIMPLE",
      indexValues: [],
    });
    // 10000 * (1 + 0.01*3) = 10300
    expect(result.netBalance).toBe(10300);
    expect(result.totalAccruedInterest).toBe(300);
  });

  it("amortização parcial no meio do período abate só os juros acumulados até ali", () => {
    const result = calculateInvestorLoanPosition({
      tranches: [{ id: "t1", principal: 10000, creditDate: new Date(2024, 0, 1) }],
      amortizations: [{ id: "a1", date: new Date(2024, 2, 1), amount: 100 }], // mar/2024
      asOfDate: new Date(2024, 3, 1), // abr/2024
      monthlyInterestPercent: 1,
      interestType: "COMPOUND",
      indexValues: [],
    });
    // até mar/1: 10000*1.01^2=10201, abate 100 de juros -> outstanding 10000, interest 101
    // até abr/1: (10000+101)*1.01=10202.01, interest = 101+101.01=202.01
    expect(result.tranches[0].amortizedInterest).toBe(100);
    expect(result.tranches[0].amortizedPrincipal).toBe(0);
    expect(result.tranches[0].outstandingPrincipal).toBe(10000);
    expect(result.netBalance).toBe(10202.01);
  });

  it("amortização maior que o saldo devedor disponível lança erro", () => {
    expect(() =>
      calculateInvestorLoanPosition({
        tranches: [{ id: "t1", principal: 1000, creditDate: new Date(2024, 0, 1) }],
        amortizations: [{ id: "a1", date: new Date(2024, 1, 1), amount: 2000 }],
        asOfDate: new Date(2024, 1, 1),
        monthlyInterestPercent: 0,
        interestType: "COMPOUND",
        indexValues: [],
      }),
    ).toThrow(/excede o saldo devedor/);
  });

  it("correção por índice combinada com juros; mês de índice faltando conta como 0% e fica registrado", () => {
    const result = calculateInvestorLoanPosition({
      tranches: [{ id: "t1", principal: 10000, creditDate: new Date(2024, 0, 1) }],
      amortizations: [],
      asOfDate: new Date(2024, 3, 1), // fev, mar, abr
      monthlyInterestPercent: 0,
      interestType: "COMPOUND",
      indexValues: [{ referenceMonth: new Date(2024, 1, 1), ratePercent: 2 }], // só fev cadastrado
    });
    expect(result.netBalance).toBe(10200); // 10000 * 1.02 (mar/abr = 0%)
    expect(result.tranches[0].segments[0].missingMonths).toEqual(["2024-03", "2024-04"]);
    expect(result.tranches[0].segments[0].monthsApplied).toEqual([
      { referenceMonth: "2024-02", ratePercent: 2 },
      { referenceMonth: "2024-03", ratePercent: 0 },
      { referenceMonth: "2024-04", ratePercent: 0 },
    ]);
  });
});

describe("calculateInvestorLoanPosition — múltiplas tranches (FIFO)", () => {
  it("amortização consome a tranche mais antiga inteira e o resto cascateia pra próxima", () => {
    const result = calculateInvestorLoanPosition({
      tranches: [
        { id: "a", principal: 1000, creditDate: new Date(2024, 0, 1) },
        { id: "b", principal: 2000, creditDate: new Date(2024, 0, 1) },
      ],
      amortizations: [{ id: "am1", date: new Date(2024, 1, 1), amount: 1500 }],
      asOfDate: new Date(2024, 1, 1),
      monthlyInterestPercent: 0,
      interestType: "COMPOUND",
      indexValues: [],
    });

    const trancheA = result.tranches.find((t) => t.id === "a")!;
    const trancheB = result.tranches.find((t) => t.id === "b")!;
    expect(trancheA.outstandingPrincipal).toBe(0);
    expect(trancheA.amortizedPrincipal).toBe(1000);
    expect(trancheB.outstandingPrincipal).toBe(1500);
    expect(trancheB.amortizedPrincipal).toBe(500);
    expect(result.netBalance).toBe(1500);
    expect(result.totalAmortizedPrincipal).toBe(1500);
  });

  it("tranche futura (creditDate após a data de referência) não entra no acúmulo", () => {
    const result = calculateInvestorLoanPosition({
      tranches: [
        { id: "a", principal: 1000, creditDate: new Date(2024, 0, 1) },
        { id: "b", principal: 5000, creditDate: new Date(2024, 5, 1) },
      ],
      amortizations: [],
      asOfDate: new Date(2024, 2, 1),
      monthlyInterestPercent: 1,
      interestType: "COMPOUND",
      indexValues: [],
    });
    const trancheB = result.tranches.find((t) => t.id === "b")!;
    expect(trancheB.netBalance).toBe(5000);
    expect(trancheB.segments).toEqual([]);
  });
});

describe("annualToMonthlyRate", () => {
  it("composto: equivalência mensal de uma taxa anual", () => {
    // 12.68% a.a. equivale a ~1% a.m. composto
    const monthly = annualToMonthlyRate(12.682503013196977, "COMPOUND");
    expect(monthly).toBeCloseTo(1, 6);
  });

  it("simples: divide a taxa anual por 12", () => {
    expect(annualToMonthlyRate(12, "SIMPLE")).toBe(1);
  });
});
