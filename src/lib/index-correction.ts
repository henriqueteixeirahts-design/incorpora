// Motor de correção monetária de uma parcela (PRD seção 12).
//
// Regras adotadas (ajustáveis conforme validação do usuário):
// - A correção contratual (índice + juros) incide do mês-base (mês de
//   assinatura do contrato) até o vencimento da parcela, ou até a data de
//   referência do cálculo (asOfDate), o que vier primeiro. Depois do
//   vencimento, a parcela para de "corrigir por índice" e passa a acumular
//   multa (uma vez) + juros de mora (simples, pro-rata por dia, mês de 30
//   dias) sobre o valor já corrigido na data de vencimento.
// - Mês de índice faltando no cadastro é tratado como 0% (não trava o
//   cálculo), mas fica registrado em `details.missingMonths` para o
//   Financeiro identificar e completar o cadastro.
// - Toda chamada real (não simulação) deve ser persistida em
//   FinancialCalculation — esta função é pura e não grava nada sozinha.

export type IndexValuePoint = { referenceMonth: Date; ratePercent: number };

export type CalculateInstallmentInput = {
  originalValue: number;
  baseMonth: Date; // mês-base da parcela (normalmente o mês da assinatura do contrato)
  dueDate: Date;
  asOfDate: Date; // data de referência do cálculo (hoje, ou uma data futura p/ simulação de antecipação)
  indexValues: IndexValuePoint[]; // valores mensais do índice contratual (qualquer mês, a função filtra)
  monthlyInterestPercent?: number | null; // juros contratuais adicionais ao índice
  interestType?: "SIMPLE" | "COMPOUND";
  latePaymentFinePercent?: number | null;
  latePaymentMonthlyInterestPercent?: number | null;
};

export type CalculateInstallmentResult = {
  baseValue: number;
  indexFactor: number;
  interestFactor: number;
  correctedValue: number; // valor no vencimento, já com índice + juros contratuais
  daysOverdue: number;
  fineAmount: number;
  overdueInterestAmount: number;
  resultValue: number; // valor final na asOfDate
  details: {
    monthsApplied: { referenceMonth: string; ratePercent: number }[];
    missingMonths: string[];
    monthlyInterestPercent: number;
    interestType: "SIMPLE" | "COMPOUND";
    latePaymentFinePercent: number;
    latePaymentMonthlyInterestPercent: number;
  };
};

export function calculateInstallment(
  input: CalculateInstallmentInput,
): CalculateInstallmentResult {
  const interestType = input.interestType ?? "COMPOUND";
  const monthlyInterestPercent = input.monthlyInterestPercent ?? 0;
  const latePaymentFinePercent = input.latePaymentFinePercent ?? 0;
  const latePaymentMonthlyInterestPercent = input.latePaymentMonthlyInterestPercent ?? 0;

  const correctionEnd = input.dueDate < input.asOfDate ? input.dueDate : input.asOfDate;
  const monthsCount = Math.max(0, monthDiff(startOfMonth(input.baseMonth), startOfMonth(correctionEnd)));

  const valuesByMonth = new Map<string, number>();
  for (const point of input.indexValues) {
    valuesByMonth.set(monthKey(point.referenceMonth), point.ratePercent);
  }

  let indexFactor = 1;
  const monthsApplied: { referenceMonth: string; ratePercent: number }[] = [];
  const missingMonths: string[] = [];

  for (let i = 1; i <= monthsCount; i++) {
    const month = addMonths(startOfMonth(input.baseMonth), i);
    const key = monthKey(month);
    const rate = valuesByMonth.get(key);
    if (rate === undefined) missingMonths.push(key);
    indexFactor *= 1 + (rate ?? 0) / 100;
    monthsApplied.push({ referenceMonth: key, ratePercent: rate ?? 0 });
  }

  const interestFactor =
    monthlyInterestPercent === 0
      ? 1
      : interestType === "COMPOUND"
        ? (1 + monthlyInterestPercent / 100) ** monthsCount
        : 1 + (monthlyInterestPercent / 100) * monthsCount;

  const correctedValue = round2(input.originalValue * indexFactor * interestFactor);

  const daysOverdue = Math.max(0, daysBetween(input.dueDate, input.asOfDate));
  const fineAmount = daysOverdue > 0 ? round2((correctedValue * latePaymentFinePercent) / 100) : 0;
  const overdueInterestAmount =
    daysOverdue > 0
      ? round2(correctedValue * (latePaymentMonthlyInterestPercent / 100) * (daysOverdue / 30))
      : 0;

  const resultValue = round2(correctedValue + fineAmount + overdueInterestAmount);

  return {
    baseValue: input.originalValue,
    indexFactor: round6(indexFactor),
    interestFactor: round6(interestFactor),
    correctedValue,
    daysOverdue,
    fineAmount,
    overdueInterestAmount,
    resultValue,
    details: {
      monthsApplied,
      missingMonths,
      monthlyInterestPercent,
      interestType,
      latePaymentFinePercent,
      latePaymentMonthlyInterestPercent,
    },
  };
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthDiff(a: Date, b: Date) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function daysBetween(a: Date, b: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((b.getTime() - a.getTime()) / msPerDay);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
