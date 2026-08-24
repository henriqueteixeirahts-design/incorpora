// Motor de repasse de permuta (docs/ESPEC_PERMUTANTES.md, Etapas 3-4).
//
// Regras adotadas (aprovadas antes de codar, mesmo rigor da Sprint 6-7):
// - Tudo em regime caixa (base "recebido") — a única base que existe.
// - Física sob gestão: repasse = recebido − corretagem externa (Natureza 1)
//   − corretagem interna (Natureza 2) − taxa de administração − retenção.
//   As duas corretagens são os valores já calculados pelo motor de
//   Comissionamento para aquele mesmo pagamento (nunca recalculadas aqui).
// - Financeira: participação = (bruto ou líquido de taxa de administração,
//   conforme configurado) × percentual do contrato. Comissão/imposto (se
//   habilitados) são deduzidos no FECHAMENTO DO PERÍODO, não por evento —
//   são informados manualmente pelo Financeiro, sem rastreamento confiável
//   por pagamento individual ainda.
// - Teto de valor (incidência VALUE_CAP): a soma acumulada de participação
//   nunca ultrapassa o teto — o evento de fronteira absorve só o restante.
// - Sem estorno em distrato (física ou financeira) — regime caixa: parcela
//   que não é paga simplesmente não gera evento novo.

export type DeductionBase = "GROSS" | "NET";

export type PhysicalRepasseInput = {
  paymentAmount: number;
  administrationFeePct: number | null;
  externalCommissionAmount: number; // já calculado pelo motor de Comissionamento p/ este pagamento
  internalCommissionAmount: number; // idem
  retentionPct: number | null;
};

export type RepasseCalculation = {
  grossBase: number;
  administrationFeeAmount: number;
  externalCommissionAmount: number;
  internalCommissionAmount: number;
  retainedAmount: number;
  share: number; // valor líquido a repassar (já descontada a retenção)
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Repasse de permuta física sob gestão — 1 evento por pagamento de parcela. */
export function calculatePhysicalRepasse(input: PhysicalRepasseInput): RepasseCalculation {
  const afterCommissions = Math.max(
    0,
    input.paymentAmount - input.externalCommissionAmount - input.internalCommissionAmount,
  );
  const administrationFeeAmount = round2(afterCommissions * ((input.administrationFeePct ?? 0) / 100));
  const afterAdminFee = round2(afterCommissions - administrationFeeAmount);
  const retainedAmount = round2(afterAdminFee * ((input.retentionPct ?? 0) / 100));
  const share = round2(afterAdminFee - retainedAmount);

  return {
    grossBase: round2(input.paymentAmount),
    administrationFeeAmount,
    externalCommissionAmount: round2(input.externalCommissionAmount),
    internalCommissionAmount: round2(input.internalCommissionAmount),
    retainedAmount,
    share,
  };
}

export type FinancialEventInput = {
  paymentAmount: number;
  administrationFeePct: number | null;
  deductionBase: DeductionBase;
  percent: number;
};

export type FinancialEventCalculation = {
  grossBase: number;
  administrationFeeAmount: number;
  share: number; // participação bruta do período (retenção/dedução manual entram só no fechamento)
};

/** Evento de apuração financeira — 1 por pagamento de parcela dentro da incidência. */
export function calculateFinancialEvent(input: FinancialEventInput): FinancialEventCalculation {
  const administrationFeeAmount = round2(input.paymentAmount * ((input.administrationFeePct ?? 0) / 100));
  const afterAdminFee = round2(input.paymentAmount - administrationFeeAmount);
  const base = input.deductionBase === "NET" ? afterAdminFee : input.paymentAmount;
  const share = round2(base * (input.percent / 100));

  return { grossBase: round2(input.paymentAmount), administrationFeeAmount, share };
}

/**
 * Aplica o teto de valor (incidência VALUE_CAP) a um evento novo, dado o
 * total já acumulado no contrato até aqui — o evento de fronteira absorve só
 * o restante até o teto; eventos depois do teto atingido não geram nada.
 */
export function applyValueCap(rawShare: number, alreadyAccrued: number, capValue: number): number {
  const remaining = round2(capValue - alreadyAccrued);
  if (remaining <= 0) return 0;
  return round2(Math.min(rawShare, remaining));
}

export type ApurationPeriodClosureInput = {
  grossAccrued: number; // soma dos `share` dos eventos do período
  commissionDeduction: number | null; // informado manualmente
  taxDeduction: number | null; // informado manualmente
  retentionPct: number | null;
};

export type ApurationPeriodClosureResult = {
  netAfterDeductions: number;
  retainedAmount: number;
  netAmount: number; // vira 1 Payable
};

/** Fechamento do período de apuração financeira — dedução manual + retenção. */
export function closeApurationPeriod(input: ApurationPeriodClosureInput): ApurationPeriodClosureResult {
  const netAfterDeductions = round2(
    Math.max(0, input.grossAccrued - (input.commissionDeduction ?? 0) - (input.taxDeduction ?? 0)),
  );
  const retainedAmount = round2(netAfterDeductions * ((input.retentionPct ?? 0) / 100));
  const netAmount = round2(netAfterDeductions - retainedAmount);

  return { netAfterDeductions, retainedAmount, netAmount };
}
