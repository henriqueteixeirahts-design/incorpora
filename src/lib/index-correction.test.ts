import { describe, it, expect } from "vitest";
import { calculateInstallment, type CorrectionPhaseConfig } from "./index-correction";

const noInterest: CorrectionPhaseConfig = { indexValues: [] };

describe("calculateInstallment — fase única (sem Habite-se)", () => {
  it("sem correção nenhuma, valor não muda", () => {
    const result = calculateInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 0, 1),
      asOfDate: new Date(2024, 0, 1),
      preHabiteSe: noInterest,
    });
    expect(result.correctedValue).toBe(1000);
    expect(result.resultValue).toBe(1000);
    expect(result.daysOverdue).toBe(0);
  });

  it("aplica índice mês a mês, compondo multiplicativamente", () => {
    // base jan/2024, vencimento abr/2024 -> 3 meses de índice (fev, mar, abr)
    const result = calculateInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 3, 10),
      asOfDate: new Date(2024, 3, 10),
      preHabiteSe: {
        indexValues: [
          { referenceMonth: new Date(2024, 1, 1), ratePercent: 1 },
          { referenceMonth: new Date(2024, 2, 1), ratePercent: 1 },
          { referenceMonth: new Date(2024, 3, 1), ratePercent: 1 },
        ],
      },
    });
    // 1000 * 1.01^3 = 1030.301
    expect(result.correctedValue).toBe(1030.3);
    expect(result.details.phases[0].missingMonths).toEqual([]);
  });

  it("mês de índice faltando conta como 0% e fica registrado em missingMonths, sem travar o cálculo", () => {
    const result = calculateInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 1, 10),
      asOfDate: new Date(2024, 1, 10),
      preHabiteSe: { indexValues: [] }, // nenhum índice cadastrado
    });
    expect(result.correctedValue).toBe(1000);
    expect(result.details.phases[0].missingMonths).toEqual(["2024-02"]);
  });

  it("juros compostos mensais sobre o número de meses do período", () => {
    const result = calculateInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 2, 1),
      asOfDate: new Date(2024, 2, 1),
      preHabiteSe: { indexValues: [], monthlyInterestPercent: 1, interestType: "COMPOUND" },
    });
    // 2 meses: 1000 * 1.01^2 = 1020.10
    expect(result.correctedValue).toBe(1020.1);
  });

  it("juros simples mensais, pro-rata linear pelo número de meses", () => {
    const result = calculateInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 2, 1),
      asOfDate: new Date(2024, 2, 1),
      preHabiteSe: { indexValues: [], monthlyInterestPercent: 1, interestType: "SIMPLE" },
    });
    // 2 meses: 1000 * (1 + 0.01*2) = 1020.00
    expect(result.correctedValue).toBe(1020);
  });
});

describe("calculateInstallment — duas fases (pré/pós Habite-se)", () => {
  it("mês do próprio Habite-se já conta como pós-Habite-se (troca vale 'a partir de')", () => {
    // base jan/2024, Habite-se em fev/2024, vencimento em fev/2024 -> o único mês corrigido (fev) já é pós
    const result = calculateInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 1, 15),
      asOfDate: new Date(2024, 1, 15),
      habiteSeDate: new Date(2024, 1, 1),
      preHabiteSe: { indexValues: [], monthlyInterestPercent: 2 }, // não deve ser usado
      postHabiteSe: { indexValues: [], monthlyInterestPercent: 1 },
    });
    expect(result.details.phases).toHaveLength(1);
    expect(result.details.phases[0].phase).toBe("POST_HABITE_SE");
  });

  it("meses antes do Habite-se usam a regra do contrato (pré), meses a partir dele usam a regra do empreendimento (pós)", () => {
    // base jan/2024, Habite-se em mar/2024, vencimento em abr/2024
    // meses corrigidos: fev(pré), mar(pós), abr(pós)
    const result = calculateInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 3, 15),
      asOfDate: new Date(2024, 3, 15),
      habiteSeDate: new Date(2024, 2, 1),
      preHabiteSe: { indexValues: [], monthlyInterestPercent: 1 },
      postHabiteSe: { indexValues: [], monthlyInterestPercent: 2 },
    });
    const pre = result.details.phases.find((p) => p.phase === "PRE_HABITE_SE")!;
    const post = result.details.phases.find((p) => p.phase === "POST_HABITE_SE")!;
    expect(pre.monthsApplied.map((m) => m.referenceMonth)).toEqual(["2024-02"]);
    expect(post.monthsApplied.map((m) => m.referenceMonth)).toEqual(["2024-03", "2024-04"]);
    // 1000 * 1.01 (fev, pré) * 1.02^2 (mar+abr, pós) = 1000 * 1.01 * 1.0404 = 1050.804
    expect(result.correctedValue).toBe(1050.8);
  });

  it("sem postHabiteSe configurado, usa a regra pré-Habite-se também depois dele (fallback)", () => {
    const result = calculateInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 2, 15),
      asOfDate: new Date(2024, 2, 15),
      habiteSeDate: new Date(2024, 2, 1),
      preHabiteSe: { indexValues: [], monthlyInterestPercent: 1 },
      postHabiteSe: null,
    });
    // 2 meses corrigidos (fev pré, mar pós) — pós sem regra própria usa a mesma taxa de preHabiteSe (fallback)
    // 1000 * 1.01 (fev) * 1.01 (mar) = 1020.10
    expect(result.correctedValue).toBe(1020.1);
  });
});

describe("calculateInstallment — multa e mora por atraso", () => {
  it("sem atraso, não gera multa nem mora", () => {
    const result = calculateInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 1, 1),
      asOfDate: new Date(2024, 1, 1),
      preHabiteSe: noInterest,
      latePaymentFinePercent: 2,
      latePaymentMonthlyInterestPercent: 1,
    });
    expect(result.fineAmount).toBe(0);
    expect(result.overdueInterestAmount).toBe(0);
    expect(result.resultValue).toBe(result.correctedValue);
  });

  it("com atraso, aplica multa uma vez e mora pro-rata por dia (mês de 30 dias)", () => {
    const result = calculateInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 1, 1),
      asOfDate: new Date(2024, 1, 16), // 15 dias de atraso
      preHabiteSe: noInterest,
      latePaymentFinePercent: 2,
      latePaymentMonthlyInterestPercent: 1,
    });
    expect(result.daysOverdue).toBe(15);
    // multa: 1000 * 2% = 20 (uma vez, sobre o valor corrigido no vencimento)
    expect(result.fineAmount).toBe(20);
    // mora: 1000 * 1% * (15/30) = 5
    expect(result.overdueInterestAmount).toBe(5);
    expect(result.resultValue).toBe(1025);
  });

  it("correção por índice para no vencimento — atraso não continua corrigindo por índice, só multa/mora", () => {
    const result = calculateInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 1, 1),
      asOfDate: new Date(2024, 3, 1), // bem depois do vencimento
      preHabiteSe: {
        indexValues: [
          { referenceMonth: new Date(2024, 1, 1), ratePercent: 5 },
          { referenceMonth: new Date(2024, 2, 1), ratePercent: 5 }, // não deve ser aplicado — é pós-vencimento
          { referenceMonth: new Date(2024, 3, 1), ratePercent: 5 },
        ],
      },
      latePaymentFinePercent: 0,
      latePaymentMonthlyInterestPercent: 0,
    });
    // só o mês de fev (até o vencimento) entra na correção por índice
    expect(result.correctedValue).toBe(1050);
    expect(result.details.phases[0].monthsApplied.map((m) => m.referenceMonth)).toEqual(["2024-02"]);
  });
});
