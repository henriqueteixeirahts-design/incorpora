import { calculateInstallment, type IndexValuePoint } from "@/lib/index-correction";

// Antecipação simulada (PRD seção 13). Puramente uma simulação — não baixa
// parcela nenhuma. A baixa real acontece pelo fluxo normal de recebimento
// (registerInstallmentPayment) depois que o cliente confirma.

export type AnticipationInstallmentInput = {
  installmentId: string;
  label: string;
  originalValue: number;
  dueDate: Date;
};

export type SimulateAnticipationInput = {
  installments: AnticipationInstallmentInput[];
  baseMonth: Date;
  asOfDate: Date;
  indexValues: IndexValuePoint[];
  monthlyInterestPercent?: number | null;
  interestType?: "SIMPLE" | "COMPOUND";
  discountPercent: number;
};

export type SimulateAnticipationResult = {
  items: {
    installmentId: string;
    label: string;
    updatedValue: number; // valor atualizado até asOfDate, sem multa/mora (parcelas futuras)
    discountAmount: number;
    presentValue: number; // valor a pagar após desconto
  }[];
  totalUpdatedValue: number;
  totalDiscount: number;
  totalPresentValue: number;
};

export function simulateAnticipation(input: SimulateAnticipationInput): SimulateAnticipationResult {
  const items = input.installments.map((installment) => {
    const calc = calculateInstallment({
      originalValue: installment.originalValue,
      baseMonth: input.baseMonth,
      dueDate: installment.dueDate,
      asOfDate: input.asOfDate,
      indexValues: input.indexValues,
      monthlyInterestPercent: input.monthlyInterestPercent,
      interestType: input.interestType,
      // antecipação não deve gerar multa/mora — só faz sentido para parcelas futuras
      latePaymentFinePercent: 0,
      latePaymentMonthlyInterestPercent: 0,
    });

    const updatedValue = calc.correctedValue;
    const discountAmount = round2((updatedValue * input.discountPercent) / 100);
    const presentValue = round2(updatedValue - discountAmount);

    return {
      installmentId: installment.installmentId,
      label: installment.label,
      updatedValue,
      discountAmount,
      presentValue,
    };
  });

  return {
    items,
    totalUpdatedValue: round2(items.reduce((sum, item) => sum + item.updatedValue, 0)),
    totalDiscount: round2(items.reduce((sum, item) => sum + item.discountAmount, 0)),
    totalPresentValue: round2(items.reduce((sum, item) => sum + item.presentValue, 0)),
  };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
