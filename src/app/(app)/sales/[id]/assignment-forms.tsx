"use client";

import { useActionState, useEffect, useRef } from "react";
import { Modal } from "@/components/Modal";
import { createAssignmentAction, signAssignmentAction, type AssignmentFormState } from "./actions";
import { GenerateDocumentForm } from "./generate-document-form";

const initialState: AssignmentFormState = {};

type Option = { id: string; label: string };

export function NewAssignmentForm({
  saleId,
  contractId,
  customers,
  currentCustomerName,
  onClose,
}: {
  saleId: string;
  contractId: string;
  customers: Option[];
  currentCustomerName: string;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(createAssignmentAction, initialState);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Nova cessão de direitos"
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
            {pending ? "Criando..." : "Ceder direitos"}
          </button>
        </>
      }
    >
      <form ref={formRef} action={formAction} className="inc-col" style={{ gap: "var(--inc-space-6)" }}>
        <input type="hidden" name="saleId" value={saleId} />
        <input type="hidden" name="contractId" value={contractId} />

        <p className="inc-help">Titular atual (cedente): {currentCustomerName}</p>

        <label className="inc-field">
          <span className="inc-label">Novo titular (cessionário)</span>
          <select id="cs-customer" name="newCustomerId" required defaultValue="" className="inc-select">
            <option value="" disabled>
              Selecione...
            </option>
            {customers.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="inc-help">Cliente não cadastrado? Cadastre em Clientes antes de continuar.</p>

        <label className="inc-field">
          <span className="inc-label">Data da cessão</span>
          <input id="cs-date" name="assignmentDate" type="date" required className="inc-input" />
        </label>

        <label className="inc-field">
          <span className="inc-label">Taxa de cessão (opcional — vira parcela nova na carteira)</span>
          <input id="cs-fee" name="feeAmount" type="number" step="0.01" min="0" className="inc-input" />
        </label>

        <label className="inc-field">
          <span className="inc-label">Observações</span>
          <textarea id="cs-notes" name="notes" rows={2} className="inc-input" style={{ height: "auto", padding: "var(--inc-space-6)" }} />
        </label>

        {state.error ? <p className="inc-help inc-help--error">{state.error}</p> : null}
      </form>
    </Modal>
  );
}

export function SignAssignmentButton({ saleId, assignmentId }: { saleId: string; assignmentId: string }) {
  return (
    <form action={signAssignmentAction}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <button type="submit" className="inc-btn inc-btn--secondary inc-btn--sm">
        Assinar cessão
      </button>
    </form>
  );
}

export function AssignmentDocumentForm({
  saleId,
  contractId,
  assignmentId,
  templates,
}: {
  saleId: string;
  contractId: string;
  assignmentId: string;
  templates: Option[];
}) {
  return (
    <GenerateDocumentForm saleId={saleId} contractId={contractId} assignmentId={assignmentId} templates={templates} />
  );
}
