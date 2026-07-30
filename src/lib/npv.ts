// Motor de VPL (docs/ESPEC_MODULO_COMERCIAL.md, Parte 5.2) — cálculo puro,
// sem I/O. Compara o valor presente de um fluxo de pagamento contra outro,
// usando uma taxa de desconto mensal (TMA).

export type RatePeriod = "MONTHLY" | "YEARLY";

/** Converte uma taxa anual pra mensal equivalente (juros compostos); mensal passa direto. */
export function monthlyRateFromPeriod(ratePercent: number, period: RatePeriod): number {
  const rate = ratePercent / 100;
  if (period === "MONTHLY") return rate;
  return Math.pow(1 + rate, 1 / 12) - 1;
}

export type NpvScheduleItem = {
  monthsFromBase: number; // pode ser fracionário, mas normalmente inteiro (meses)
  amount: number;
};

/** VPL = soma de amount / (1+i)^n, n em meses a partir da data-base. */
export function calculateNPV(schedule: NpvScheduleItem[], monthlyRate: number): number {
  const total = schedule.reduce((sum, item) => {
    const presentValue = item.amount / Math.pow(1 + monthlyRate, item.monthsFromBase);
    return sum + presentValue;
  }, 0);
  return round2(total);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
