import { describe, it, expect } from "vitest";
import { simulateAnticipation } from "./anticipation";

describe("simulateAnticipation", () => {
  it("aplica desconto sobre o valor atualizado de cada parcela e soma os totais", () => {
    const result = simulateAnticipation({
      installments: [
        { installmentId: "1", label: "Parcela 1", originalValue: 1000, dueDate: new Date(2024, 5, 1) },
        { installmentId: "2", label: "Parcela 2", originalValue: 2000, dueDate: new Date(2024, 6, 1) },
      ],
      baseMonth: new Date(2024, 0, 1),
      asOfDate: new Date(2024, 2, 1),
      preHabiteSe: { indexValues: [] },
      discountPercent: 10,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].updatedValue).toBe(1000);
    expect(result.items[0].discountAmount).toBe(100);
    expect(result.items[0].presentValue).toBe(900);
    expect(result.items[1].updatedValue).toBe(2000);
    expect(result.items[1].discountAmount).toBe(200);
    expect(result.items[1].presentValue).toBe(1800);

    expect(result.totalUpdatedValue).toBe(3000);
    expect(result.totalDiscount).toBe(300);
    expect(result.totalPresentValue).toBe(2700);
  });

  it("nunca gera multa/mora — antecipação é sempre sobre parcela futura", () => {
    // vencimento no passado em relação ao asOfDate, mas antecipação zera multa/mora de propósito
    const result = simulateAnticipation({
      installments: [
        { installmentId: "1", label: "Parcela vencida", originalValue: 1000, dueDate: new Date(2024, 0, 1) },
      ],
      baseMonth: new Date(2023, 11, 1),
      asOfDate: new Date(2024, 5, 1),
      preHabiteSe: { indexValues: [] },
      discountPercent: 0,
    });
    // sem desconto e sem índice cadastrado, updatedValue deve ficar igual ao original — sem multa/mora somados
    expect(result.items[0].updatedValue).toBe(1000);
    expect(result.items[0].presentValue).toBe(1000);
  });

  it("aplica correção por índice antes do desconto quando há regra configurada", () => {
    const result = simulateAnticipation({
      installments: [
        { installmentId: "1", label: "Parcela 1", originalValue: 1000, dueDate: new Date(2024, 2, 1) },
      ],
      baseMonth: new Date(2024, 0, 1),
      asOfDate: new Date(2024, 2, 1),
      preHabiteSe: {
        indexValues: [{ referenceMonth: new Date(2024, 1, 1), ratePercent: 10 }],
      },
      discountPercent: 10,
    });
    // 1000 * 1.10 = 1100 corrigido; desconto de 10% = 110; presente = 990
    expect(result.items[0].updatedValue).toBe(1100);
    expect(result.items[0].discountAmount).toBe(110);
    expect(result.items[0].presentValue).toBe(990);
  });
});
