// Motor de correção monetária de uma parcela (PRD seção 12).
//
// Regras adotadas (ajustáveis conforme validação do usuário):
// - A correção tem até duas fases contratuais, na sequência:
//     1) Obra (pré-Habite-se): índice + juros configurados no CONTRATO.
//     2) Pós-Habite-se: índice + juros configurados no EMPREENDIMENTO
//        (mesma regra para todos os contratos daquele empreendimento —
//        TSH confirmou que a troca de regra é por empreendimento, não por
//        contrato individual, e o gatilho é a data do Habite-se, diferente
//        da data de entrega ao cliente).
//   A correção é calculada mês a mês entre o mês-base da parcela (exclusive)
//   e o vencimento/data de referência (inclusive); cada mês usa a fase
//   vigente NAQUELE mês — o mês do próprio Habite-se já conta como
//   pós-Habite-se (a troca vale "a partir de", não "depois de").
// - Depois do vencimento, a parcela para de corrigir por índice e passa a
//   acumular multa (uma vez) + juros de mora (simples, pro-rata por dia,
//   mês de 30 dias) sobre o valor já corrigido na data de vencimento.
// - Mês de índice faltando no cadastro é tratado como 0% (não trava o
//   cálculo), mas fica registrado em `details.missingMonths` para o
//   Financeiro identificar e completar o cadastro.
// - Toda chamada real (não simulação) deve ser persistida em
//   FinancialCalculation — esta função é pura e não grava nada sozinha.

export type IndexValuePoint = { referenceMonth: Date; ratePercent: number };

export type CorrectionPhaseConfig = {
  indexValues: IndexValuePoint[];
  monthlyInterestPercent?: number | null;
  interestType?: "SIMPLE" | "COMPOUND";
};

export type CalculateInstallmentInput = {
  originalValue: number;
  baseMonth: Date; // mês-base da parcela (normalmente o mês da assinatura do contrato)
  dueDate: Date;
  asOfDate: Date; // data de referência do cálculo (hoje, ou uma data futura p/ simulação de antecipação)
  habiteSeDate?: Date | null; // gatilho da troca de fase; null = só a fase de obra existe
  preHabiteSe: CorrectionPhaseConfig;
  postHabiteSe?: CorrectionPhaseConfig | null;
  latePaymentFinePercent?: number | null;
  latePaymentMonthlyInterestPercent?: number | null;
};

type PhaseName = "PRE_HABITE_SE" | "POST_HABITE_SE";

export type CalculateInstallmentResult = {
  baseValue: number;
  indexFactor: number; // fator combinado das duas fases (índice x juros contratuais)
  interestFactor: number; // mantido por compatibilidade — sempre 1 (juros já entram no indexFactor por fase)
  correctedValue: number; // valor no vencimento, já com índice + juros contratuais das fases aplicáveis
  daysOverdue: number;
  fineAmount: number;
  overdueInterestAmount: number;
  resultValue: number; // valor final na asOfDate
  details: {
    phases: {
      phase: PhaseName;
      monthsApplied: { referenceMonth: string; ratePercent: number }[];
      missingMonths: string[];
      monthlyInterestPercent: number;
      interestType: "SIMPLE" | "COMPOUND";
      factor: number;
    }[];
    latePaymentFinePercent: number;
    latePaymentMonthlyInterestPercent: number;
  };
};

export function calculateInstallment(
  input: CalculateInstallmentInput,
): CalculateInstallmentResult {
  const latePaymentFinePercent = input.latePaymentFinePercent ?? 0;
  const latePaymentMonthlyInterestPercent = input.latePaymentMonthlyInterestPercent ?? 0;

  const correctionEnd = input.dueDate < input.asOfDate ? input.dueDate : input.asOfDate;
  const baseMonthStart = startOfMonth(input.baseMonth);
  const correctionEndMonth = startOfMonth(correctionEnd);
  const habiteSeMonth = input.habiteSeDate ? startOfMonth(input.habiteSeDate) : null;

  const monthsCount = Math.max(0, monthDiff(baseMonthStart, correctionEndMonth));

  // Classifica cada mês do intervalo na fase vigente naquele mês. O mês do
  // próprio Habite-se já entra como pós-Habite-se.
  const preMonths: Date[] = [];
  const postMonths: Date[] = [];
  for (let i = 1; i <= monthsCount; i++) {
    const month = addMonths(baseMonthStart, i);
    if (habiteSeMonth !== null && month >= habiteSeMonth) {
      postMonths.push(month);
    } else {
      preMonths.push(month);
    }
  }

  const phases: CalculateInstallmentResult["details"]["phases"] = [];
  let combinedFactor = 1;

  if (preMonths.length > 0) {
    const phase = applyPhase("PRE_HABITE_SE", preMonths, input.preHabiteSe);
    phases.push(phase.detail);
    combinedFactor *= phase.factor;
  }
  if (postMonths.length > 0) {
    const phase = applyPhase("POST_HABITE_SE", postMonths, input.postHabiteSe ?? input.preHabiteSe);
    phases.push(phase.detail);
    combinedFactor *= phase.factor;
  }

  const correctedValue = round2(input.originalValue * combinedFactor);

  const daysOverdue = Math.max(0, daysBetween(input.dueDate, input.asOfDate));
  const fineAmount = daysOverdue > 0 ? round2((correctedValue * latePaymentFinePercent) / 100) : 0;
  const overdueInterestAmount =
    daysOverdue > 0
      ? round2(correctedValue * (latePaymentMonthlyInterestPercent / 100) * (daysOverdue / 30))
      : 0;

  const resultValue = round2(correctedValue + fineAmount + overdueInterestAmount);

  return {
    baseValue: input.originalValue,
    indexFactor: round6(combinedFactor),
    interestFactor: 1,
    correctedValue,
    daysOverdue,
    fineAmount,
    overdueInterestAmount,
    resultValue,
    details: {
      phases,
      latePaymentFinePercent,
      latePaymentMonthlyInterestPercent,
    },
  };
}

function applyPhase(phase: PhaseName, months: Date[], config: CorrectionPhaseConfig) {
  const interestType = config.interestType ?? "COMPOUND";
  const monthlyInterestPercent = config.monthlyInterestPercent ?? 0;

  const valuesByMonth = new Map<string, number>();
  for (const point of config.indexValues) {
    valuesByMonth.set(monthKey(point.referenceMonth), point.ratePercent);
  }

  let indexFactor = 1;
  const monthsApplied: { referenceMonth: string; ratePercent: number }[] = [];
  const missingMonths: string[] = [];

  for (const month of months) {
    const key = monthKey(month);
    const rate = valuesByMonth.get(key);
    if (rate === undefined) missingMonths.push(key);
    indexFactor *= 1 + (rate ?? 0) / 100;
    monthsApplied.push({ referenceMonth: key, ratePercent: rate ?? 0 });
  }

  const monthsCount = months.length;
  const interestFactor =
    monthlyInterestPercent === 0
      ? 1
      : interestType === "COMPOUND"
        ? (1 + monthlyInterestPercent / 100) ** monthsCount
        : 1 + (monthlyInterestPercent / 100) * monthsCount;

  const factor = indexFactor * interestFactor;

  return {
    factor,
    detail: {
      phase,
      monthsApplied,
      missingMonths,
      monthlyInterestPercent,
      interestType,
      factor: round6(factor),
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
