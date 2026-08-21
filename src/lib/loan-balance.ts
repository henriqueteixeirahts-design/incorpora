// Motor de saldo devedor de mútuo entre investidor e SPE
// (docs/ESPEC_APORTES_INVESTIDORES.md, Parte 1.2 e Parte 3).
//
// Regras adotadas (mesma filosofia de src/lib/index-correction.ts):
// - Cada aporte (SpeInvestorContribution) é uma tranche independente, com
//   saldo próprio acumulado desde sua creditDate — o saldo devedor do
//   investidor é a soma das tranches.
// - Juros + correção por índice acumulam mês a mês (granularidade mensal,
//   igual ao motor de vendas — o mês em que um evento acontece só entra
//   no acúmulo do mês seguinte, mesma convenção de "mês-base exclusive").
//   Fator do mês = fator índice × fator juros (composto (1+r)^n ou simples
//   1+r*n conforme configurado por investidor); o crescimento do período
//   inteiro (saldo final − saldo inicial) é integralmente contabilizado
//   como juros acumulados — o principal só muda por amortização.
// - Carência (loanGraceMonths) não altera esta função: ela afeta apenas a
//   exigibilidade de cobrança (decisão do usuário), não o acúmulo — juros
//   continuam capitalizando durante a carência.
// - Amortização abate juros acumulados primeiro, depois principal —
//   sempre na tranche mais antiga com saldo (FIFO); se sobrar valor após
//   zerar uma tranche, o restante é aplicado em cascata à próxima.
// - Mês de índice faltando no cadastro é tratado como 0% (não trava o
//   cálculo), mas fica registrado em `missingMonths` por segmento.
// - Função pura, não persiste nada — quem chama decide quando gravar um
//   snapshot (SpeInvestorLoanCalculation).

export type LoanInterestType = "SIMPLE" | "COMPOUND";

export type LoanIndexValuePoint = { referenceMonth: Date; ratePercent: number };

export type LoanTrancheInput = {
  id: string;
  principal: number;
  creditDate: Date;
};

export type LoanAmortizationInput = {
  id: string;
  date: Date;
  amount: number;
};

export type CalculateInvestorLoanPositionInput = {
  tranches: LoanTrancheInput[];
  amortizations: LoanAmortizationInput[];
  asOfDate: Date;
  monthlyInterestPercent: number;
  interestType: LoanInterestType;
  indexValues: LoanIndexValuePoint[];
};

export type LoanTrancheSegment = {
  fromMonth: string;
  toMonth: string;
  monthsApplied: { referenceMonth: string; ratePercent: number }[];
  missingMonths: string[];
  factor: number;
};

export type LoanTrancheResult = {
  id: string;
  principal: number;
  outstandingPrincipal: number;
  accruedInterest: number;
  amortizedInterest: number;
  amortizedPrincipal: number;
  netBalance: number;
  segments: LoanTrancheSegment[];
};

export type CalculateInvestorLoanPositionResult = {
  tranches: LoanTrancheResult[];
  totalPrincipal: number;
  totalOutstandingPrincipal: number;
  totalAccruedInterest: number;
  totalAmortizedInterest: number;
  totalAmortizedPrincipal: number;
  netBalance: number;
};

/** Converte uma taxa anual contratada para o equivalente mensal usado no acúmulo mês a mês. */
export function annualToMonthlyRate(annualPercent: number, interestType: LoanInterestType): number {
  if (interestType === "COMPOUND") {
    return (Math.pow(1 + annualPercent / 100, 1 / 12) - 1) * 100;
  }
  return annualPercent / 12;
}

type TrancheState = {
  id: string;
  principal: number;
  creditDate: Date;
  outstandingPrincipal: number;
  accruedInterest: number;
  amortizedInterest: number;
  amortizedPrincipal: number;
  lastCheckpoint: Date;
  segments: LoanTrancheSegment[];
};

export function calculateInvestorLoanPosition(
  input: CalculateInvestorLoanPositionInput,
): CalculateInvestorLoanPositionResult {
  const indexByMonth = new Map<string, number>();
  for (const point of input.indexValues) {
    indexByMonth.set(monthKey(point.referenceMonth), point.ratePercent);
  }

  const tranches: TrancheState[] = [...input.tranches]
    .sort((a, b) => a.creditDate.getTime() - b.creditDate.getTime())
    .map((t) => ({
      id: t.id,
      principal: t.principal,
      creditDate: t.creditDate,
      outstandingPrincipal: t.principal,
      accruedInterest: 0,
      amortizedInterest: 0,
      amortizedPrincipal: 0,
      lastCheckpoint: t.creditDate,
      segments: [],
    }));

  function accrue(tranche: TrancheState, toDate: Date) {
    const from = tranche.lastCheckpoint < tranche.creditDate ? tranche.creditDate : tranche.lastCheckpoint;
    if (toDate <= from) {
      tranche.lastCheckpoint = toDate;
      return;
    }
    const months = monthsBetween(from, toDate);
    tranche.lastCheckpoint = toDate;
    if (months.length === 0) return;

    const balanceStart = tranche.outstandingPrincipal + tranche.accruedInterest;
    const { factor, monthsApplied, missingMonths } = computeFactor(
      months,
      input.monthlyInterestPercent,
      input.interestType,
      indexByMonth,
    );
    const balanceEnd = balanceStart * factor;
    tranche.accruedInterest += balanceEnd - balanceStart;
    tranche.segments.push({
      fromMonth: monthKey(from),
      toMonth: monthKey(toDate),
      monthsApplied,
      missingMonths,
      factor: round6(factor),
    });
  }

  const events = [...input.amortizations].sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const event of events) {
    let remaining = event.amount;
    for (const tranche of tranches) {
      if (remaining <= 1e-9) break;
      if (tranche.creditDate > event.date) continue;
      accrue(tranche, event.date);

      const payFromInterest = Math.min(remaining, tranche.accruedInterest);
      if (payFromInterest > 0) {
        tranche.accruedInterest -= payFromInterest;
        tranche.amortizedInterest += payFromInterest;
        remaining -= payFromInterest;
      }
      if (remaining > 1e-9) {
        const payFromPrincipal = Math.min(remaining, tranche.outstandingPrincipal);
        if (payFromPrincipal > 0) {
          tranche.outstandingPrincipal -= payFromPrincipal;
          tranche.amortizedPrincipal += payFromPrincipal;
          remaining -= payFromPrincipal;
        }
      }
    }
    if (remaining > 1e-9) {
      throw new Error(
        `Amortização de ${event.amount.toFixed(2)} em ${event.date.toISOString().slice(0, 10)} excede o saldo devedor disponível na data.`,
      );
    }
  }

  for (const tranche of tranches) {
    if (tranche.creditDate > input.asOfDate) continue;
    accrue(tranche, input.asOfDate);
  }

  const results: LoanTrancheResult[] = tranches.map((t) => ({
    id: t.id,
    principal: round2(t.principal),
    outstandingPrincipal: round2(t.outstandingPrincipal),
    accruedInterest: round2(t.accruedInterest),
    amortizedInterest: round2(t.amortizedInterest),
    amortizedPrincipal: round2(t.amortizedPrincipal),
    netBalance: round2(t.outstandingPrincipal + t.accruedInterest),
    segments: t.segments,
  }));

  const totalPrincipal = round2(results.reduce((sum, t) => sum + t.principal, 0));
  const totalOutstandingPrincipal = round2(results.reduce((sum, t) => sum + t.outstandingPrincipal, 0));
  const totalAccruedInterest = round2(results.reduce((sum, t) => sum + t.accruedInterest, 0));
  const totalAmortizedInterest = round2(results.reduce((sum, t) => sum + t.amortizedInterest, 0));
  const totalAmortizedPrincipal = round2(results.reduce((sum, t) => sum + t.amortizedPrincipal, 0));

  return {
    tranches: results,
    totalPrincipal,
    totalOutstandingPrincipal,
    totalAccruedInterest,
    totalAmortizedInterest,
    totalAmortizedPrincipal,
    netBalance: round2(totalOutstandingPrincipal + totalAccruedInterest),
  };
}

function computeFactor(
  months: Date[],
  monthlyInterestPercent: number,
  interestType: LoanInterestType,
  indexByMonth: Map<string, number>,
) {
  let indexFactor = 1;
  const monthsApplied: { referenceMonth: string; ratePercent: number }[] = [];
  const missingMonths: string[] = [];

  for (const month of months) {
    const key = monthKey(month);
    const rate = indexByMonth.get(key);
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

  return { factor: indexFactor * interestFactor, monthsApplied, missingMonths };
}

function monthsBetween(fromExclusive: Date, toInclusive: Date): Date[] {
  const start = startOfMonth(fromExclusive);
  const end = startOfMonth(toInclusive);
  const count = Math.max(0, monthDiff(start, end));
  const months: Date[] = [];
  for (let i = 1; i <= count; i++) months.push(addMonths(start, i));
  return months;
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

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
