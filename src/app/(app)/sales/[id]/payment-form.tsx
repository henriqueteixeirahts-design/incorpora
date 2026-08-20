"use client";

import { useActionState } from "react";
import { registerPaymentAction, recalculatePortfolioAction, type FormState } from "./actions";

const initialState: FormState = {};

export function RegisterPaymentForm({
  saleId,
  installmentId,
}: {
  saleId: string;
  installmentId: string;
}) {
  const [state, formAction, pending] = useActionState(registerPaymentAction, initialState);

  return (
    <form action={formAction} className="inc-row" style={{ flexWrap: "wrap" }}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="installmentId" value={installmentId} />
      <input name="amount" type="number" step="0.01" placeholder="Valor" required className="inc-input" style={{ width: 100 }} />
      <input name="paidAt" type="date" required className="inc-input" />
      <input name="method" placeholder="PIX/Boleto..." className="inc-input" style={{ width: 110 }} />
      <button type="submit" disabled={pending} className="inc-btn inc-btn--primary inc-btn--sm">
        {pending ? "..." : "Registrar"}
      </button>
      {state.error ? <span className="inc-help inc-help--error">{state.error}</span> : null}
    </form>
  );
}

export function RecalculatePortfolioButton({
  saleId,
  portfolioId,
}: {
  saleId: string;
  portfolioId: string;
}) {
  return (
    <form action={recalculatePortfolioAction}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="portfolioId" value={portfolioId} />
      <button type="submit" className="inc-btn inc-btn--secondary inc-btn--sm">
        Recalcular carteira
      </button>
    </form>
  );
}
