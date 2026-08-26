import "server-only";

import { computeAllocationAmountsFromPercent } from "@/lib/payable-allocation";
import type { TransactionClient } from "@/lib/prisma";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Distribui `amount` (uma fatia recém-reconhecida de comissão externa) pro-
 * rata entre os ExternalCommissionSplit da venda, incrementando `paidAmount`
 * (nunca passa do `value` de cada um) e atualizando o `status`.
 */
async function distributeExternalRecognition(tx: TransactionClient, saleId: string, amount: number) {
  const splits = await tx.externalCommissionSplit.findMany({ where: { saleId } });
  if (splits.length === 0 || amount <= 0) return;

  const amounts = computeAllocationAmountsFromPercent(
    amount,
    splits.map((s) => ({ developmentId: null, percent: Number(s.percent) })),
  );

  for (let i = 0; i < splits.length; i++) {
    const split = splits[i];
    const value = Number(split.value);
    const newPaid = round2(Math.min(value, Number(split.paidAmount) + amounts[i].amount));
    const status = newPaid <= 0 ? "PENDING" : newPaid >= value - 0.01 ? "PAID" : "PARTIALLY_PAID";
    await tx.externalCommissionSplit.update({ where: { id: split.id }, data: { paidAmount: newPaid, status } });
  }
}

/**
 * Reconhece, no momento em que um pagamento de parcela é registrado
 * (src/server/receivables.ts::registerInstallmentPayment, SEMPRE dentro da
 * mesma transação do pagamento), a fatia de comissão que esse pagamento
 * realiza — as duas naturezas ao mesmo tempo
 * (docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 4):
 *
 * - EXTERNA (Natureza 1): só a fatia do pagamento correspondente à
 *   `externalCommissionPortion` da parcela é distribuída (pro-rata por
 *   percent) entre os `ExternalCommissionSplit` da venda —
 *   `externalCommissionRecognized` na própria parcela evita reconhecer de
 *   novo o que pagamentos parciais anteriores já cobriram.
 * - INTERNA (Natureza 2): acumula sobre o valor TOTAL deste pagamento
 *   (decisão do usuário — "% sobre o valor da venda" é a base, o regime
 *   caixa é só sobre QUANDO acumula, não sobre quanto) — nunca passa do
 *   `value` total do split.
 */
/**
 * Devolve o quanto deste pagamento específico foi reconhecido como comissão
 * nas duas naturezas — reaproveitado por outros motores que precisam saber
 * "quanto deste pagamento é corretagem" sem recalcular a mesma conta (ex.:
 * repasse de permuta física, docs/ESPEC_PERMUTANTES.md, Etapa 3 — "corretagem
 * daquela venda é custo do permutante").
 */
export type CommissionRecognitionResult = {
  externalRecognized: number;
  internalAccrued: number;
};

export async function recognizeCommissionOnPayment(
  tx: TransactionClient,
  params: { installmentId: string; saleId: string; paymentAmount: number },
): Promise<CommissionRecognitionResult> {
  const installment = await tx.installment.findUniqueOrThrow({ where: { id: params.installmentId } });
  const externalPortion = Number(installment.externalCommissionPortion);

  let externalRecognized = 0;
  if (externalPortion > 0) {
    const originalValue = Number(installment.originalValue);
    const ratio = originalValue > 0 ? externalPortion / originalValue : 0;
    const rawShare = round2(params.paymentAmount * ratio);
    const alreadyRecognized = Number(installment.externalCommissionRecognized);
    const newlyRecognized = round2(Math.min(rawShare, externalPortion - alreadyRecognized));

    if (newlyRecognized > 0) {
      await tx.installment.update({
        where: { id: params.installmentId },
        data: { externalCommissionRecognized: round2(alreadyRecognized + newlyRecognized) },
      });
      await distributeExternalRecognition(tx, params.saleId, newlyRecognized);
      externalRecognized = newlyRecognized;
    }
  }

  let internalAccrued = 0;
  const internalSplit = await tx.commissionSplit.findFirst({
    where: { saleId: params.saleId, beneficiaryType: "MANAGER" },
  });
  if (internalSplit) {
    const value = Number(internalSplit.value);
    const percent = Number(internalSplit.percent);
    const accrualShare = round2(params.paymentAmount * (percent / 100));
    const previousAccrued = Number(internalSplit.accruedAmount);
    const newAccrued = round2(Math.min(value, previousAccrued + accrualShare));
    if (newAccrued !== previousAccrued) {
      await tx.commissionSplit.update({ where: { id: internalSplit.id }, data: { accruedAmount: newAccrued } });
      internalAccrued = round2(newAccrued - previousAccrued);
    }
  }

  return { externalRecognized, internalAccrued };
}
