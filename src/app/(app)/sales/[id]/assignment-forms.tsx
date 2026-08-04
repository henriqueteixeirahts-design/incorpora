"use client";

import { useActionState } from "react";
import { createAssignmentAction, signAssignmentAction, type AssignmentFormState } from "./actions";
import { GenerateDocumentForm } from "./generate-document-form";

const initialState: AssignmentFormState = {};

type Option = { id: string; label: string };

export function NewAssignmentForm({
  saleId,
  contractId,
  customers,
  currentCustomerName,
}: {
  saleId: string;
  contractId: string;
  customers: Option[];
  currentCustomerName: string;
}) {
  const [state, formAction, pending] = useActionState(createAssignmentAction, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 420 }}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="contractId" value={contractId} />

      <p className="field-hint">Titular atual (cedente): {currentCustomerName}</p>

      <label htmlFor="cs-customer">Novo titular (cessionário)</label>
      <select id="cs-customer" name="newCustomerId" required defaultValue="">
        <option value="" disabled>
          Selecione...
        </option>
        {customers.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="field-hint">Cliente não cadastrado? Cadastre em Clientes antes de continuar.</p>

      <label htmlFor="cs-date">Data da cessão</label>
      <input id="cs-date" name="assignmentDate" type="date" required />

      <label htmlFor="cs-fee">Taxa de cessão (opcional — vira parcela nova na carteira)</label>
      <input id="cs-fee" name="feeAmount" type="number" step="0.01" min="0" />

      <label htmlFor="cs-notes">Observações</label>
      <textarea id="cs-notes" name="notes" rows={2} />

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Cessão criada como rascunho.</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Criando..." : "Ceder direitos"}
      </button>
    </form>
  );
}

export function SignAssignmentButton({ saleId, assignmentId }: { saleId: string; assignmentId: string }) {
  return (
    <form action={signAssignmentAction}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <button type="submit">Assinar cessão</button>
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
