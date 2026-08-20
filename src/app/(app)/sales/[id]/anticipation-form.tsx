"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { simulateAnticipationAction, type AnticipationState } from "./actions";
import { formatCurrencyBRL } from "@/lib/format";

const initialState: AnticipationState = {};

type InstallmentOption = { id: string; label: string; dueDate: string };

const formatCurrency = formatCurrencyBRL;

function AnticipationModal({
  installments,
  state,
  formAction,
  pending,
  onClose,
}: {
  installments: InstallmentOption[];
  state: AnticipationState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.result) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.result]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Simular antecipação"
      width={460}
      footer={
        <>
          <button type="button" className="inc-btn inc-btn--secondary" onClick={onClose}>
            Fechar
          </button>
          <button
            type="button"
            className="inc-btn inc-btn--primary"
            disabled={pending}
            onClick={() => formRef.current?.requestSubmit()}
          >
            {pending ? "Simulando..." : "Simular antecipação"}
          </button>
        </>
      }
    >
      <form ref={formRef} action={formAction} className="inc-col" style={{ gap: "var(--inc-space-6)" }}>
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
      </form>
    </Modal>
  );
}

export function AnticipationForm({ installments }: { installments: InstallmentOption[] }) {
  const [state, formAction, pending] = useActionState(simulateAnticipationAction, initialState);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="inc-col" style={{ gap: "var(--inc-space-6)" }}>
      <button type="button" className="inc-btn inc-btn--primary inc-btn--sm" onClick={() => setModalOpen(true)}>
        + Simular antecipação
      </button>

      {state.result ? (
        <div className="inc-card" style={{ padding: "var(--inc-space-8)", fontSize: "var(--inc-fs-base)", maxWidth: 420 }}>
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

      {modalOpen ? (
        <AnticipationModal
          installments={installments}
          state={state}
          formAction={formAction}
          pending={pending}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </div>
  );
}
