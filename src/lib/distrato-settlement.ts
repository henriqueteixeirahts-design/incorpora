// Cálculo do acerto de distrato (Lei 13.786/18 — docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md,
// Parte 2.4). Cálculo puro — sem I/O; quem busca a carteira e a regra no
// banco é a camada de servidor (src/server/contract-distratos.ts).
//
// Leitura assumida pra "total pago... valores corrigidos": a soma nominal
// (`paidAmount`) do que o cliente efetivamente pagou. Não aplica correção
// monetária retroativa sobre os pagamentos já feitos — o motor de índices
// existente (IndexRule/FinancialCalculation) corrige o saldo AINDA DEVIDO
// pra frente a partir do vencimento, não reindexação de valores já
// recebidos pra data de hoje; inventar esse segundo tipo de correção fica
// fora do escopo desta etapa (decisão a ser revista se o negócio pedir).

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type DistratoSettlementInput = {
  /** Soma de `paidAmount` de todas as parcelas da carteira. */
  totalPaid: number;
  /** % de retenção da incorporadora, já validado contra o teto legal (25%/50%). */
  retentionPercent: number;
  /** Comissão de corretagem a deduzir, se configurado o estorno via desconto direto. */
  brokerageDeductionAmount?: number;
  /** Taxa de fruição/ocupação, se houve entrega do imóvel. */
  occupancyFeeAmount?: number;
};

export type DistratoSettlementResult = {
  totalPaid: number;
  retentionPercent: number;
  retentionAmount: number;
  brokerageDeductionAmount: number;
  occupancyFeeAmount: number;
  /** Nunca negativo — se as deduções superarem o total pago, o valor a devolver é zero (não vira cobrança adicional ao cliente). */
  refundAmount: number;
};

export function calculateDistratoSettlement(input: DistratoSettlementInput): DistratoSettlementResult {
  const totalPaid = round2(input.totalPaid);
  const retentionAmount = round2((totalPaid * input.retentionPercent) / 100);
  const brokerageDeductionAmount = round2(input.brokerageDeductionAmount ?? 0);
  const occupancyFeeAmount = round2(input.occupancyFeeAmount ?? 0);
  const refundAmount = Math.max(0, round2(totalPaid - retentionAmount - brokerageDeductionAmount - occupancyFeeAmount));

  return {
    totalPaid,
    retentionPercent: input.retentionPercent,
    retentionAmount,
    brokerageDeductionAmount,
    occupancyFeeAmount,
    refundAmount,
  };
}

/** Teto legal de retenção (Lei 13.786/18, art. 67-A): 25% em geral, 50% com patrimônio de afetação instituído. */
export function maxRetentionPercent(hasPropertyAffectation: boolean): number {
  return hasPropertyAffectation ? 50 : 25;
}
