"use client";

import { useActionState } from "react";
import { simulateAnticipationAction, type AnticipationState } from "./actions";

const initialState: AnticipationState = {};

type InstallmentOption = { id: string; label: string; dueDate: string };

export function AnticipationForm({ installments }: { installments: InstallmentOption[] }) {
  const [state, formAction, pending] = useActionState(simulateAnticipationAction, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 420 }}>
      <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>
        Selecione as parcelas futuras e o desconto para simular — nada é baixado automaticamente.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {installments.map((installment) => (
          <label key={installment.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input type="checkbox" name="installmentIds" value={installment.id} />
            {installment.label} — vence {installment.dueDate}
          </label>
        ))}
      </div>

      <label htmlFor="discountPercent">Desconto (%)</label>
      <input id="discountPercent" name="discountPercent" type="number" step="0.01" defaultValue={0} />

      {state.error ? <p className="error-text">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Simulando..." : "Simular antecipação"}
      </button>

      {state.result ? (
        <div
          style={{
            border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
            borderRadius: 8,
            padding: "0.75rem",
            marginTop: "0.5rem",
            fontSize: "0.85rem",
          }}
        >
          <ul>
            {state.result.items.map((item) => (
              <li key={item.installmentId}>
                {item.label}: atualizado {formatCurrency(item.updatedValue)} — desconto{" "}
                {formatCurrency(item.discountAmount)} — a pagar {formatCurrency(item.presentValue)}
              </li>
            ))}
          </ul>
          <p style={{ marginTop: "0.5rem" }}>
            <strong>Total a pagar: {formatCurrency(state.result.totalPresentValue)}</strong>{" "}
            (atualizado {formatCurrency(state.result.totalUpdatedValue)} — desconto{" "}
            {formatCurrency(state.result.totalDiscount)})
          </p>
        </div>
      ) : null}
    </form>
  );
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
