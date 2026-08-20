"use client";

import { useActionState } from "react";
import { simulateAnticipationAction, type AnticipationState } from "./actions";
import { formatCurrencyBRL } from "@/lib/format";

const initialState: AnticipationState = {};

type InstallmentOption = { id: string; label: string; dueDate: string };

export function AnticipationForm({ installments }: { installments: InstallmentOption[] }) {
  const [state, formAction, pending] = useActionState(simulateAnticipationAction, initialState);

  return (
    <form action={formAction} className="inc-col" style={{ gap: "var(--inc-space-6)", maxWidth: 420 }}>
      <p className="inc-help">
        Selecione as parcelas futuras e o desconto para simular — nada é baixado automaticamente.
      </p>

      <div className="inc-col" style={{ gap: "var(--inc-space-3)" }}>
        {installments.map((installment) => (
          <label key={installment.id} className="inc-row" style={{ fontSize: "var(--inc-fs-base)" }}>
            <input type="checkbox" name="installmentIds" value={installment.id} />
            {installment.label} — vence {installment.dueDate}
          </label>
        ))}
      </div>

      <label className="inc-field">
        <span className="inc-label">Desconto (%)</span>
        <input id="discountPercent" name="discountPercent" type="number" step="0.01" defaultValue={0} className="inc-input" />
      </label>

      {state.error ? <p className="inc-help inc-help--error">{state.error}</p> : null}

      <button type="submit" disabled={pending} className="inc-btn inc-btn--primary">
        {pending ? "Simulando..." : "Simular antecipação"}
      </button>

      {state.result ? (
        <div className="inc-card" style={{ padding: "var(--inc-space-8)", fontSize: "var(--inc-fs-base)" }}>
          <ul style={{ paddingLeft: "1.1rem" }}>
            {state.result.items.map((item) => (
              <li key={item.installmentId}>
                {item.label}: atualizado {formatCurrency(item.updatedValue)} — desconto{" "}
                {formatCurrency(item.discountAmount)} — a pagar {formatCurrency(item.presentValue)}
              </li>
            ))}
          </ul>
          <p style={{ marginTop: "var(--inc-space-6)" }}>
            <strong>Total a pagar: {formatCurrency(state.result.totalPresentValue)}</strong>{" "}
            (atualizado {formatCurrency(state.result.totalUpdatedValue)} — desconto{" "}
            {formatCurrency(state.result.totalDiscount)})
          </p>
        </div>
      ) : null}
    </form>
  );
}

const formatCurrency = formatCurrencyBRL;
