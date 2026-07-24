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
    <form
      action={formAction}
      style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}
    >
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="installmentId" value={installmentId} />
      <input name="amount" type="number" step="0.01" placeholder="Valor" required style={{ width: 100 }} />
      <input name="paidAt" type="date" required />
      <input name="method" placeholder="PIX/Boleto..." style={{ width: 110 }} />
      <button type="submit" disabled={pending}>
        {pending ? "..." : "Registrar"}
      </button>
      {state.error ? <span className="error-text">{state.error}</span> : null}
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
      <button type="submit" className="secondary">
        Recalcular carteira
      </button>
    </form>
  );
}
