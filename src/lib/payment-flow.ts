// Simulador de fluxo de pagamento (PRD seção 5). Cálculo puro — não persiste
// nada; o resultado é congelado em Proposal.paymentFlow quando a proposta é
// criada. A carteira de recebíveis real (parcelas, indexadores) é da Fase 9-10.

export type PaymentFlowItem = {
  label: string;
  dueOffsetMonths: number;
  amount: number;
};

export type PaymentFlowInput = {
  salePrice: number;
  downPaymentPercent?: number | null;
  monthlyInstallments?: number | null;
  keysInstallmentPercent?: number | null;
};

export type PaymentFlowResult = {
  items: PaymentFlowItem[];
  totalNominal: number;
};

export function simulatePaymentFlow(input: PaymentFlowInput): PaymentFlowResult {
  const { salePrice } = input;
  const downPaymentPercent = input.downPaymentPercent ?? 0;
  const keysInstallmentPercent = input.keysInstallmentPercent ?? 0;
  const monthlyCount = input.monthlyInstallments ?? 0;

  const downPayment = round2((salePrice * downPaymentPercent) / 100);
  const keysInstallment = round2((salePrice * keysInstallmentPercent) / 100);
  const remaining = round2(salePrice - downPayment - keysInstallment);

  const items: PaymentFlowItem[] = [];

  if (downPayment > 0) {
    items.push({ label: "Entrada", dueOffsetMonths: 0, amount: downPayment });
  }

  if (monthlyCount > 0 && remaining > 0) {
    const perInstallment = round2(remaining / monthlyCount);
    let allocated = 0;
    for (let i = 1; i <= monthlyCount; i++) {
      const amount = i === monthlyCount ? round2(remaining - allocated) : perInstallment;
      allocated = round2(allocated + amount);
      items.push({ label: `Parcela mensal ${i}/${monthlyCount}`, dueOffsetMonths: i, amount });
    }
  } else if (remaining > 0) {
    items.push({ label: "Saldo", dueOffsetMonths: monthlyCount + 1, amount: remaining });
  }

  if (keysInstallment > 0) {
    items.push({
      label: "Chaves",
      dueOffsetMonths: monthlyCount + 1,
      amount: keysInstallment,
    });
  }

  const totalNominal = round2(items.reduce((sum, item) => sum + item.amount, 0));

  return { items, totalNominal };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
