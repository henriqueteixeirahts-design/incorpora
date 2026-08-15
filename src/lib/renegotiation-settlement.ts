// Cálculo do consolidado de um acordo de renegociação de parcelas (Fase B,
// Parte 2.2) — cálculo puro, sem I/O. Quem soma o valor corrigido/encargos
// de cada parcela selecionada (via `getInstallmentLivePosition`, o mesmo
// motor de correção ao vivo das etapas 1 e 2) é a camada de servidor
// (src/server/renegotiations.ts); aqui só entra o desconto sobre encargos.

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type RenegotiationSettlementInput = {
  /** Soma do valor corrigido (índice + juros contratuais, sem multa/mora) das parcelas selecionadas. */
  consolidatedPrincipal: number;
  /** Soma de multa + juros de mora das parcelas selecionadas — só isso é elegível a desconto. */
  consolidatedCharges: number;
  chargesDiscountPercent: number;
};

export type RenegotiationSettlementResult = {
  consolidatedPrincipal: number;
  consolidatedCharges: number;
  chargesDiscountPercent: number;
  chargesDiscountAmount: number;
  /** consolidatedPrincipal + consolidatedCharges - chargesDiscountAmount — antes de descontar a entrada do acordo. */
  finalValue: number;
};

export function calculateRenegotiationSettlement(input: RenegotiationSettlementInput): RenegotiationSettlementResult {
  const consolidatedPrincipal = round2(input.consolidatedPrincipal);
  const consolidatedCharges = round2(input.consolidatedCharges);
  const chargesDiscountAmount = round2((consolidatedCharges * input.chargesDiscountPercent) / 100);
  const finalValue = round2(consolidatedPrincipal + consolidatedCharges - chargesDiscountAmount);

  return {
    consolidatedPrincipal,
    consolidatedCharges,
    chargesDiscountPercent: input.chargesDiscountPercent,
    chargesDiscountAmount,
    finalValue,
  };
}
