// Reimplementação INDEPENDENTE da correção monetária de parcela, só para a
// verificação V3 (consistência da memória) da auditoria de atualização
// (docs/ESPEC_CONFIABILIDADE_JOBS_AUDITORIA.md, Parte 2). Propositalmente
// não importa nada de src/lib/index-correction.ts nem de src/server/
// receivables.ts — "quem verifica não é quem executa": se o motor de
// correção real tiver um bug de lógica, uma segunda implementação escrita
// separadamente tem boa chance de não reproduzir o mesmo bug, e a
// divergência entre as duas acende o alarme. Reusar a função do motor pra
// conferir a si mesma sempre bateria, mesmo com o motor errado — é
// exatamente o que a especificação pede pra evitar.
//
// Mesma regra de negócio do motor real (deliberadamente redundante, não
// uma regra nova): índice mês a mês entre o mês-base (exclusive) e o
// vencimento/asOfDate (inclusive), fase pré/pós-Habite-se (o mês do próprio
// Habite-se já conta como pós), juros contratuais por fase, e depois do
// vencimento multa (uma vez) + mora pro-rata (mês de 30 dias) sobre o valor
// corrigido no vencimento. Validado em audit-correction-recompute.test.ts
// contra os MESMOS vetores de teste do motor real, pra garantir que as duas
// implementações concordam quando os dados estão corretos — só divergem
// quando há um bug de verdade.

export type IndependentIndexPoint = { referenceMonth: Date; ratePercent: number };

export type IndependentPhaseConfig = {
  indexValues: IndependentIndexPoint[];
  monthlyInterestPercent?: number | null;
  interestType?: "SIMPLE" | "COMPOUND";
};

export type IndependentRecomputeInput = {
  originalValue: number;
  baseMonth: Date;
  dueDate: Date;
  asOfDate: Date;
  habiteSeDate?: Date | null;
  preHabiteSe: IndependentPhaseConfig;
  postHabiteSe?: IndependentPhaseConfig | null;
  latePaymentFinePercent?: number | null;
  latePaymentMonthlyInterestPercent?: number | null;
};

export type IndependentRecomputeResult = {
  correctedValue: number;
  resultValue: number;
};

function monthCursor(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthTag(date: Date) {
  return date.getFullYear() * 12 + date.getMonth();
}

function centsRound(value: number) {
  return Math.round(value * 100) / 100;
}

/** Fator de correção de uma fase, computado via soma de log em vez de produto acumulado — mesma matemática, caminho de código diferente. */
function phaseFactor(months: Date[], config: IndependentPhaseConfig): number {
  const rateByMonth = new Map<string, number>();
  for (const point of config.indexValues) {
    rateByMonth.set(`${point.referenceMonth.getFullYear()}-${point.referenceMonth.getMonth()}`, point.ratePercent);
  }

  let logSum = 0;
  for (const month of months) {
    const key = `${month.getFullYear()}-${month.getMonth()}`;
    const rate = rateByMonth.get(key) ?? 0;
    logSum += Math.log(1 + rate / 100);
  }
  const indexFactor = Math.exp(logSum);

  const monthlyInterestPercent = config.monthlyInterestPercent ?? 0;
  const interestType = config.interestType ?? "COMPOUND";
  let interestFactor = 1;
  if (monthlyInterestPercent !== 0) {
    if (interestType === "COMPOUND") {
      interestFactor = Math.exp(months.length * Math.log(1 + monthlyInterestPercent / 100));
    } else {
      interestFactor = 1 + (monthlyInterestPercent / 100) * months.length;
    }
  }

  return indexFactor * interestFactor;
}

export function independentlyRecomputeInstallment(
  input: IndependentRecomputeInput,
): IndependentRecomputeResult {
  const correctionEnd = input.dueDate < input.asOfDate ? input.dueDate : input.asOfDate;
  const endTag = monthTag(monthCursor(correctionEnd));
  const habiteSeTag = input.habiteSeDate ? monthTag(monthCursor(input.habiteSeDate)) : null;

  const preMonths: Date[] = [];
  const postMonths: Date[] = [];
  // Passeia mês a mês por incremento de cursor (setMonth), não por índice
  // numérico de array — outro ponto de divergência estrutural do motor real.
  const cursor = monthCursor(input.baseMonth);
  cursor.setMonth(cursor.getMonth() + 1);
  while (monthTag(cursor) <= endTag) {
    const tag = monthTag(cursor);
    if (habiteSeTag !== null && tag >= habiteSeTag) {
      postMonths.push(new Date(cursor));
    } else {
      preMonths.push(new Date(cursor));
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  let combinedFactor = 1;
  if (preMonths.length > 0) combinedFactor *= phaseFactor(preMonths, input.preHabiteSe);
  if (postMonths.length > 0) combinedFactor *= phaseFactor(postMonths, input.postHabiteSe ?? input.preHabiteSe);

  const correctedValue = centsRound(input.originalValue * combinedFactor);

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysOverdue = Math.max(0, Math.floor((input.asOfDate.getTime() - input.dueDate.getTime()) / msPerDay));

  const finePercent = input.latePaymentFinePercent ?? 0;
  const moraPercent = input.latePaymentMonthlyInterestPercent ?? 0;
  const fineAmount = daysOverdue > 0 ? centsRound((correctedValue * finePercent) / 100) : 0;
  const overdueInterestAmount =
    daysOverdue > 0 ? centsRound(correctedValue * (moraPercent / 100) * (daysOverdue / 30)) : 0;

  const resultValue = centsRound(correctedValue + fineAmount + overdueInterestAmount);

  return { correctedValue, resultValue };
}
