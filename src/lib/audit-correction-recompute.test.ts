import { describe, it, expect } from "vitest";
import { independentlyRecomputeInstallment, type IndependentPhaseConfig } from "./audit-correction-recompute";

/**
 * Mesmos vetores de teste de src/lib/index-correction.test.ts, rodados
 * contra a reimplementação independente usada pela verificação V3 da
 * auditoria de atualização. O objetivo NÃO é testar a regra de negócio de
 * novo (isso já é coberto pelo motor real) — é confirmar que as duas
 * implementações concordam byte a byte quando os dados estão corretos, pra
 * que a única fonte de divergência real na produção seja um bug de
 * verdade, não uma diferença espúria entre os dois caminhos de código.
 */

const noInterest: IndependentPhaseConfig = { indexValues: [] };

describe("independentlyRecomputeInstallment — fase única (sem Habite-se)", () => {
  it("sem correção nenhuma, valor não muda", () => {
    const result = independentlyRecomputeInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 0, 1),
      asOfDate: new Date(2024, 0, 1),
      preHabiteSe: noInterest,
    });
    expect(result.correctedValue).toBe(1000);
    expect(result.resultValue).toBe(1000);
  });

  it("aplica índice mês a mês, compondo multiplicativamente", () => {
    const result = independentlyRecomputeInstallment({
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
    expect(result.correctedValue).toBe(1030.3);
  });

  it("mês de índice faltando conta como 0%, sem travar o cálculo", () => {
    const result = independentlyRecomputeInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 1, 10),
      asOfDate: new Date(2024, 1, 10),
      preHabiteSe: { indexValues: [] },
    });
    expect(result.correctedValue).toBe(1000);
  });

  it("juros compostos mensais sobre o número de meses do período", () => {
    const result = independentlyRecomputeInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 2, 1),
      asOfDate: new Date(2024, 2, 1),
      preHabiteSe: { indexValues: [], monthlyInterestPercent: 1, interestType: "COMPOUND" },
    });
    expect(result.correctedValue).toBe(1020.1);
  });

  it("juros simples mensais, pro-rata linear pelo número de meses", () => {
    const result = independentlyRecomputeInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 2, 1),
      asOfDate: new Date(2024, 2, 1),
      preHabiteSe: { indexValues: [], monthlyInterestPercent: 1, interestType: "SIMPLE" },
    });
    expect(result.correctedValue).toBe(1020);
  });
});

describe("independentlyRecomputeInstallment — duas fases (pré/pós Habite-se)", () => {
  it("mês do próprio Habite-se já conta como pós-Habite-se", () => {
    const result = independentlyRecomputeInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 1, 15),
      asOfDate: new Date(2024, 1, 15),
      habiteSeDate: new Date(2024, 1, 1),
      preHabiteSe: { indexValues: [], monthlyInterestPercent: 2 },
      postHabiteSe: { indexValues: [], monthlyInterestPercent: 1 },
    });
    // só a regra pós (1%) deveria valer: 1000 * 1.01 = 1010
    expect(result.correctedValue).toBe(1010);
  });

  it("meses antes do Habite-se usam a regra pré, meses a partir dele usam a regra pós", () => {
    const result = independentlyRecomputeInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 3, 15),
      asOfDate: new Date(2024, 3, 15),
      habiteSeDate: new Date(2024, 2, 1),
      preHabiteSe: { indexValues: [], monthlyInterestPercent: 1 },
      postHabiteSe: { indexValues: [], monthlyInterestPercent: 2 },
    });
    expect(result.correctedValue).toBe(1050.8);
  });

  it("sem postHabiteSe configurado, usa a regra pré-Habite-se também depois dele (fallback)", () => {
    const result = independentlyRecomputeInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 2, 15),
      asOfDate: new Date(2024, 2, 15),
      habiteSeDate: new Date(2024, 2, 1),
      preHabiteSe: { indexValues: [], monthlyInterestPercent: 1 },
      postHabiteSe: null,
    });
    expect(result.correctedValue).toBe(1020.1);
  });
});

describe("independentlyRecomputeInstallment — multa e mora por atraso", () => {
  it("sem atraso, não gera multa nem mora", () => {
    const result = independentlyRecomputeInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 1, 1),
      asOfDate: new Date(2024, 1, 1),
      preHabiteSe: noInterest,
      latePaymentFinePercent: 2,
      latePaymentMonthlyInterestPercent: 1,
    });
    expect(result.resultValue).toBe(result.correctedValue);
  });

  it("com atraso, aplica multa uma vez e mora pro-rata por dia (mês de 30 dias)", () => {
    const result = independentlyRecomputeInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 1, 1),
      asOfDate: new Date(2024, 1, 16),
      preHabiteSe: noInterest,
      latePaymentFinePercent: 2,
      latePaymentMonthlyInterestPercent: 1,
    });
    expect(result.resultValue).toBe(1025);
  });

  it("correção por índice para no vencimento — atraso não continua corrigindo por índice", () => {
    const result = independentlyRecomputeInstallment({
      originalValue: 1000,
      baseMonth: new Date(2024, 0, 1),
      dueDate: new Date(2024, 1, 1),
      asOfDate: new Date(2024, 3, 1),
      preHabiteSe: {
        indexValues: [
          { referenceMonth: new Date(2024, 1, 1), ratePercent: 5 },
          { referenceMonth: new Date(2024, 2, 1), ratePercent: 5 },
          { referenceMonth: new Date(2024, 3, 1), ratePercent: 5 },
        ],
      },
      latePaymentFinePercent: 0,
      latePaymentMonthlyInterestPercent: 0,
    });
    expect(result.correctedValue).toBe(1050);
  });
});
