import { describe, expect, it } from "vitest";
import { buildNominalSchedule, evaluateProposal, type ProposalEvaluationRuleValues } from "./proposal-evaluation";
import { simulatePaymentFlow } from "./payment-flow";
import type { CorrectionPhaseConfig } from "./index-correction";

const NO_CORRECTION: CorrectionPhaseConfig = { indexValues: [], monthlyInterestPercent: null };

const BASE_RULE: ProposalEvaluationRuleValues = {
  allowOffTable: true,
  discountRatePercent: 0, // rate 0 -> VPL = soma nominal, isola a classificação da matemática de desconto
  discountRatePeriod: "MONTHLY",
  vplTolerancePercent: 3,
  vplAnalysisLimitPercent: 10,
  minDownPaymentPercent: 10,
  maxTermMonths: 120,
  maxPostKeysPercent: 30,
};

describe("buildNominalSchedule", () => {
  it("sem correção, o valor nominal é o próprio valor do item (conferido à mão)", () => {
    const schedule = buildNominalSchedule(
      [{ label: "Entrada", dueOffsetMonths: 0, amount: 1000, isDownPayment: true }],
      new Date(2026, 0, 1),
      null,
      NO_CORRECTION,
      null,
    );
    expect(schedule).toEqual([{ monthsFromBase: 0, amount: 1000 }]);
  });

  it("aplica a correção da fase de obra — conferido à mão contra o fator de juros compostos", () => {
    // 1000, 2 meses de juros compostos de 1% a.m. -> 1000 * 1.01^2 = 1020.10
    const schedule = buildNominalSchedule(
      [{ label: "Parcela", dueOffsetMonths: 2, amount: 1000 }],
      new Date(2026, 0, 1),
      null,
      { indexValues: [], monthlyInterestPercent: 1, interestType: "COMPOUND" },
      null,
    );
    expect(schedule[0].amount).toBeCloseTo(1000 * Math.pow(1.01, 2), 2);
    expect(schedule[0].amount).toBe(1020.1);
  });
});

describe("evaluateProposal — classificação por VPL (taxa 0%, matemática isolada)", () => {
  it("fluxo idêntico ao padrão -> desvio 0% -> aprovada automaticamente", () => {
    const salePrice = 100000;
    const flow = simulatePaymentFlow({ salePrice, downPaymentPercent: 20, monthlyInstallments: 10 });

    const result = evaluateProposal({
      standardFlow: flow,
      proposedFlow: flow,
      isOffTable: false,
      baseDate: new Date(2026, 0, 1),
      habiteSeDate: null,
      preHabiteSe: NO_CORRECTION,
      postHabiteSe: null,
      salePrice,
      rule: BASE_RULE,
    });

    expect(result.deviationPercent).toBe(0);
    expect(result.status).toBe("APPROVED_AUTO");
    expect(result.npvStandard).toBe(result.npvProposed);
  });

  it("deságio de exatamente 3% (na borda da tolerância) ainda aprova automaticamente", () => {
    const salePrice = 100000;
    const standardFlow = simulatePaymentFlow({ salePrice, downPaymentPercent: 20, monthlyInstallments: 10 });
    // Fluxo proposto vale 97% do padrão nominalmente -> desvio de -3% exato.
    const proposedFlow = { items: standardFlow.items.map((i) => ({ ...i, amount: i.amount * 0.97 })), totalNominal: 0 };

    const result = evaluateProposal({
      standardFlow,
      proposedFlow,
      isOffTable: true,
      baseDate: new Date(2026, 0, 1),
      habiteSeDate: null,
      preHabiteSe: NO_CORRECTION,
      postHabiteSe: null,
      salePrice,
      rule: BASE_RULE,
    });

    expect(result.deviationPercent).toBeCloseTo(-3, 1);
    expect(result.status).toBe("APPROVED_AUTO");
  });

  it("deságio de 5% (entre tolerância 3% e limite 10%) -> aguardando análise", () => {
    const salePrice = 100000;
    const standardFlow = simulatePaymentFlow({ salePrice, downPaymentPercent: 20, monthlyInstallments: 10 });
    const proposedFlow = { items: standardFlow.items.map((i) => ({ ...i, amount: i.amount * 0.95 })), totalNominal: 0 };

    const result = evaluateProposal({
      standardFlow,
      proposedFlow,
      isOffTable: true,
      baseDate: new Date(2026, 0, 1),
      habiteSeDate: null,
      preHabiteSe: NO_CORRECTION,
      postHabiteSe: null,
      salePrice,
      rule: BASE_RULE,
    });

    expect(result.deviationPercent).toBeCloseTo(-5, 1);
    expect(result.status).toBe("PENDING_ANALYSIS");
  });

  it("deságio de 15% (além do limite de 10%) -> reprovada automaticamente", () => {
    const salePrice = 100000;
    const standardFlow = simulatePaymentFlow({ salePrice, downPaymentPercent: 20, monthlyInstallments: 10 });
    const proposedFlow = { items: standardFlow.items.map((i) => ({ ...i, amount: i.amount * 0.85 })), totalNominal: 0 };

    const result = evaluateProposal({
      standardFlow,
      proposedFlow,
      isOffTable: true,
      baseDate: new Date(2026, 0, 1),
      habiteSeDate: null,
      preHabiteSe: NO_CORRECTION,
      postHabiteSe: null,
      salePrice,
      rule: BASE_RULE,
    });

    expect(result.deviationPercent).toBeCloseTo(-15, 1);
    expect(result.status).toBe("REJECTED_AUTO");
  });

  it("entrada abaixo do mínimo reprova na hora, independente do VPL", () => {
    const salePrice = 100000;
    const standardFlow = simulatePaymentFlow({ salePrice, downPaymentPercent: 20, monthlyInstallments: 10 });
    // Entrada de 5% (abaixo do mínimo de 10%), mesma base de preço do padrão.
    const proposedFlow = simulatePaymentFlow({ salePrice, downPaymentPercent: 5, monthlyInstallments: 10 });

    const result = evaluateProposal({
      standardFlow,
      proposedFlow,
      isOffTable: true,
      baseDate: new Date(2026, 0, 1),
      habiteSeDate: null,
      preHabiteSe: NO_CORRECTION,
      postHabiteSe: null,
      salePrice,
      rule: BASE_RULE,
    });

    expect(result.checks.downPaymentPercent).toBeCloseTo(5, 1);
    expect(result.status).toBe("REJECTED_AUTO");
    expect(result.reason).toMatch(/entrada/i);
  });

  it("prazo total acima do máximo reprova na hora", () => {
    const salePrice = 100000;
    const standardFlow = simulatePaymentFlow({ salePrice, downPaymentPercent: 20, monthlyInstallments: 10 });
    const proposedFlow = simulatePaymentFlow({ salePrice, downPaymentPercent: 20, monthlyInstallments: 130 });

    const result = evaluateProposal({
      standardFlow,
      proposedFlow,
      isOffTable: true,
      baseDate: new Date(2026, 0, 1),
      habiteSeDate: null,
      preHabiteSe: NO_CORRECTION,
      postHabiteSe: null,
      salePrice,
      rule: BASE_RULE,
    });

    expect(result.checks.termMonths).toBeGreaterThan(120);
    expect(result.status).toBe("REJECTED_AUTO");
    expect(result.reason).toMatch(/prazo/i);
  });

  it("percentual pós-chaves acima do máximo reprova na hora", () => {
    const salePrice = 100000;
    const standardFlow = simulatePaymentFlow({ salePrice, downPaymentPercent: 20, monthlyInstallments: 10 });
    // 50% de chaves (pós-entrega), acima do máximo de 30% da regra.
    const proposedFlow = simulatePaymentFlow({
      salePrice,
      downPaymentPercent: 20,
      monthlyInstallments: 10,
      keysInstallmentPercent: 50,
    });

    const result = evaluateProposal({
      standardFlow,
      proposedFlow,
      isOffTable: true,
      baseDate: new Date(2026, 0, 1),
      habiteSeDate: null,
      preHabiteSe: NO_CORRECTION,
      postHabiteSe: null,
      salePrice,
      rule: BASE_RULE,
    });

    expect(result.checks.postKeysPercent).toBeCloseTo(50, 1);
    expect(result.status).toBe("REJECTED_AUTO");
    expect(result.reason).toMatch(/pós-chaves/i);
  });

  it("fora da tabela reprova na hora quando o empreendimento não aceita (allowOffTable=false)", () => {
    const salePrice = 100000;
    const standardFlow = simulatePaymentFlow({ salePrice, downPaymentPercent: 20, monthlyInstallments: 10 });

    const result = evaluateProposal({
      standardFlow,
      proposedFlow: standardFlow,
      isOffTable: true,
      baseDate: new Date(2026, 0, 1),
      habiteSeDate: null,
      preHabiteSe: NO_CORRECTION,
      postHabiteSe: null,
      salePrice,
      rule: { ...BASE_RULE, allowOffTable: false },
    });

    expect(result.status).toBe("REJECTED_AUTO");
    expect(result.reason).toMatch(/não aceita/i);
  });
});
