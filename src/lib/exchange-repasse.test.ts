import { describe, it, expect } from "vitest";
import {
  calculatePhysicalRepasse,
  calculateFinancialEvent,
  applyValueCap,
  closeApurationPeriod,
} from "./exchange-repasse";

describe("calculatePhysicalRepasse — permuta física sob gestão", () => {
  it("recebido − corretagem externa − corretagem interna − taxa de administração − retenção", () => {
    // 10.000 recebido, 500 corretagem externa, 300 interna, 5% taxa adm, 10% retenção
    // afterCommissions = 10000 - 500 - 300 = 9200
    // adminFee = 9200 * 0.05 = 460 -> afterAdminFee = 8740
    // retained = 8740 * 0.10 = 874 -> share = 7866
    const result = calculatePhysicalRepasse({
      paymentAmount: 10000,
      administrationFeePct: 5,
      externalCommissionAmount: 500,
      internalCommissionAmount: 300,
      retentionPct: 10,
    });
    expect(result.administrationFeeAmount).toBe(460);
    expect(result.retainedAmount).toBe(874);
    expect(result.share).toBe(7866);
  });

  it("sem taxa de administração nem retenção configuradas, sem corretagem — repasse = 100% do recebido", () => {
    const result = calculatePhysicalRepasse({
      paymentAmount: 5000,
      administrationFeePct: null,
      externalCommissionAmount: 0,
      internalCommissionAmount: 0,
      retentionPct: null,
    });
    expect(result.share).toBe(5000);
  });

  it("corretagem maior que o recebido (caso extremo) não gera repasse negativo", () => {
    const result = calculatePhysicalRepasse({
      paymentAmount: 1000,
      administrationFeePct: 0,
      externalCommissionAmount: 800,
      internalCommissionAmount: 500,
      retentionPct: 0,
    });
    expect(result.share).toBe(0);
  });
});

describe("calculateFinancialEvent — permuta financeira, base recebido", () => {
  it("base BRUTA: % aplica sobre o valor recebido, sem descontar taxa de administração da base", () => {
    // 20.000 recebido, 3% taxa adm (só informativo aqui, não afeta a base bruta), 15%
    const result = calculateFinancialEvent({
      paymentAmount: 20000,
      administrationFeePct: 3,
      deductionBase: "GROSS",
      percent: 15,
    });
    expect(result.administrationFeeAmount).toBe(600);
    expect(result.share).toBe(3000); // 20000 * 0.15
  });

  it("base LÍQUIDA: % aplica sobre o valor já sem a taxa de administração", () => {
    // afterAdminFee = 20000 - 600 = 19400; share = 19400 * 0.15 = 2910
    const result = calculateFinancialEvent({
      paymentAmount: 20000,
      administrationFeePct: 3,
      deductionBase: "NET",
      percent: 15,
    });
    expect(result.share).toBe(2910);
  });
});

describe("applyValueCap — incidência até valor-teto", () => {
  it("evento dentro do teto passa inteiro", () => {
    expect(applyValueCap(1000, 5000, 10000)).toBe(1000);
  });

  it("evento de fronteira absorve só o restante até o teto", () => {
    expect(applyValueCap(3000, 9000, 10000)).toBe(1000);
  });

  it("teto já atingido: evento seguinte não gera nada", () => {
    expect(applyValueCap(500, 10000, 10000)).toBe(0);
  });
});

describe("closeApurationPeriod — fechamento do período financeiro", () => {
  it("sem dedução manual nem retenção: valor a repassar = bruto apurado", () => {
    const result = closeApurationPeriod({
      grossAccrued: 5000,
      commissionDeduction: null,
      taxDeduction: null,
      retentionPct: null,
    });
    expect(result.netAmount).toBe(5000);
  });

  it("com dedução manual de comissão e imposto, e retenção sobre o líquido", () => {
    // 5000 - 300 (comissão) - 200 (imposto) = 4500; retido 10% = 450; net = 4050
    const result = closeApurationPeriod({
      grossAccrued: 5000,
      commissionDeduction: 300,
      taxDeduction: 200,
      retentionPct: 10,
    });
    expect(result.netAfterDeductions).toBe(4500);
    expect(result.retainedAmount).toBe(450);
    expect(result.netAmount).toBe(4050);
  });

  it("dedução manual maior que o apurado não gera valor negativo", () => {
    const result = closeApurationPeriod({
      grossAccrued: 1000,
      commissionDeduction: 900,
      taxDeduction: 500,
      retentionPct: 0,
    });
    expect(result.netAfterDeductions).toBe(0);
    expect(result.netAmount).toBe(0);
  });
});
