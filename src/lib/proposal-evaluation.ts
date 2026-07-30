// Módulo de avaliação automática de propostas (docs/ESPEC_MODULO_COMERCIAL.md,
// Parte 5.2) — cálculo puro, sem I/O. Compara o VPL do fluxo proposto contra
// o VPL do fluxo da tabela padrão, aplicando primeiro os limites duros e
// depois a faixa de tolerância/deságio configurada por empreendimento.
//
// O fluxo NOMINAL de cada parcela passa pelo motor de correção em duas fases
// já existente (src/lib/index-correction.ts) antes do desconto a valor
// presente — mesma filosofia da carteira real, sem duplicar a lógica de
// índice/juros contratuais.

import { calculateInstallment, type CorrectionPhaseConfig } from "@/lib/index-correction";
import { calculateNPV, monthlyRateFromPeriod, type RatePeriod } from "@/lib/npv";
import type { PaymentFlowItem, PaymentFlowResult } from "@/lib/payment-flow";

export type ProposalEvaluationRuleValues = {
  allowOffTable: boolean;
  discountRatePercent: number;
  discountRatePeriod: RatePeriod;
  vplTolerancePercent: number;
  vplAnalysisLimitPercent: number;
  minDownPaymentPercent: number;
  maxTermMonths: number;
  maxPostKeysPercent: number;
};

export type EvaluationChecks = {
  isOffTable: boolean;
  downPaymentPercent: number;
  minDownPaymentPercent: number;
  termMonths: number;
  maxTermMonths: number;
  postKeysPercent: number;
  maxPostKeysPercent: number;
};

export type ProposalEvaluationStatus = "APPROVED_AUTO" | "PENDING_ANALYSIS" | "REJECTED_AUTO";

export type EvaluationResult = {
  status: ProposalEvaluationStatus;
  npvStandard: number;
  npvProposed: number;
  /** (npvProposed - npvStandard) / npvStandard * 100 — negativo = pior pra SPE (deságio). */
  deviationPercent: number;
  reason: string;
  checks: EvaluationChecks;
};

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

/** Projeta o valor nominal de cada item do fluxo na sua data de vencimento, aplicando a correção em duas fases. */
export function buildNominalSchedule(
  items: PaymentFlowItem[],
  baseDate: Date,
  habiteSeDate: Date | null,
  preHabiteSe: CorrectionPhaseConfig,
  postHabiteSe: CorrectionPhaseConfig | null,
): { monthsFromBase: number; amount: number }[] {
  return items.map((item) => {
    const dueDate = addMonths(baseDate, item.dueOffsetMonths);
    const result = calculateInstallment({
      originalValue: item.amount,
      baseMonth: baseDate,
      dueDate,
      asOfDate: dueDate,
      habiteSeDate,
      preHabiteSe,
      postHabiteSe,
    });
    return { monthsFromBase: item.dueOffsetMonths, amount: result.correctedValue };
  });
}

function computeChecks(flow: PaymentFlowResult, salePrice: number, isOffTable: boolean): EvaluationChecks {
  const downPaymentAmount = flow.items.filter((i) => i.isDownPayment).reduce((sum, i) => sum + i.amount, 0);
  const keysItem = flow.items.find((i) => i.isKeysInstallment);
  const termMonths = flow.items.reduce((max, i) => Math.max(max, i.dueOffsetMonths), 0);
  // Pós-chaves = a própria parcela de chaves (paga na entrega) + qualquer
  // parcela devida depois dela.
  const postKeysAmount = keysItem
    ? flow.items.filter((i) => i.dueOffsetMonths >= keysItem.dueOffsetMonths).reduce((sum, i) => sum + i.amount, 0)
    : 0;

  return {
    isOffTable,
    downPaymentPercent: salePrice > 0 ? round2((downPaymentAmount / salePrice) * 100) : 0,
    minDownPaymentPercent: 0, // preenchido pelo chamador com o valor da regra
    termMonths,
    maxTermMonths: 0,
    postKeysPercent: salePrice > 0 ? round2((postKeysAmount / salePrice) * 100) : 0,
    maxPostKeysPercent: 0,
  };
}

export function evaluateProposal(params: {
  standardFlow: PaymentFlowResult;
  proposedFlow: PaymentFlowResult;
  isOffTable: boolean;
  baseDate: Date;
  habiteSeDate: Date | null;
  preHabiteSe: CorrectionPhaseConfig;
  postHabiteSe: CorrectionPhaseConfig | null;
  salePrice: number;
  rule: ProposalEvaluationRuleValues;
}): EvaluationResult {
  const { standardFlow, proposedFlow, isOffTable, baseDate, habiteSeDate, preHabiteSe, postHabiteSe, salePrice, rule } =
    params;

  const monthlyRate = monthlyRateFromPeriod(rule.discountRatePercent, rule.discountRatePeriod);

  const standardSchedule = buildNominalSchedule(standardFlow.items, baseDate, habiteSeDate, preHabiteSe, postHabiteSe);
  const proposedSchedule = buildNominalSchedule(proposedFlow.items, baseDate, habiteSeDate, preHabiteSe, postHabiteSe);

  const npvStandard = calculateNPV(standardSchedule, monthlyRate);
  const npvProposed = calculateNPV(proposedSchedule, monthlyRate);
  const deviationPercent = npvStandard > 0 ? round2(((npvProposed - npvStandard) / npvStandard) * 100) : 0;

  const checks = computeChecks(proposedFlow, salePrice, isOffTable);
  checks.minDownPaymentPercent = rule.minDownPaymentPercent;
  checks.maxTermMonths = rule.maxTermMonths;
  checks.maxPostKeysPercent = rule.maxPostKeysPercent;

  const base = { npvStandard, npvProposed, deviationPercent, checks };

  if (isOffTable && !rule.allowOffTable) {
    return { ...base, status: "REJECTED_AUTO", reason: "Este empreendimento não aceita propostas fora da tabela padrão." };
  }
  if (checks.downPaymentPercent < rule.minDownPaymentPercent) {
    return {
      ...base,
      status: "REJECTED_AUTO",
      reason: `Entrada de ${checks.downPaymentPercent}% abaixo do mínimo exigido (${rule.minDownPaymentPercent}%).`,
    };
  }
  if (checks.termMonths > rule.maxTermMonths) {
    return {
      ...base,
      status: "REJECTED_AUTO",
      reason: `Prazo total de ${checks.termMonths} meses acima do máximo permitido (${rule.maxTermMonths} meses).`,
    };
  }
  if (checks.postKeysPercent > rule.maxPostKeysPercent) {
    return {
      ...base,
      status: "REJECTED_AUTO",
      reason: `Percentual pós-chaves de ${checks.postKeysPercent}% acima do máximo permitido (${rule.maxPostKeysPercent}%).`,
    };
  }

  if (deviationPercent >= -rule.vplTolerancePercent) {
    return {
      ...base,
      status: "APPROVED_AUTO",
      reason: `VPL dentro da tolerância (desvio de ${deviationPercent}%, tolerância ${rule.vplTolerancePercent}%).`,
    };
  }
  if (deviationPercent >= -rule.vplAnalysisLimitPercent) {
    return {
      ...base,
      status: "PENDING_ANALYSIS",
      reason: `VPL fora da tolerância (desvio de ${deviationPercent}%) mas dentro do limite de deságio (${rule.vplAnalysisLimitPercent}%) — enviada para análise.`,
    };
  }
  return {
    ...base,
    status: "REJECTED_AUTO",
    reason: `Deságio de VPL de ${deviationPercent}% além do limite permitido (${rule.vplAnalysisLimitPercent}%).`,
  };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
