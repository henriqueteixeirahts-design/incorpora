"use client";

import { useActionState, useState } from "react";
import { createAmendmentAction, signAmendmentAction, type AmendmentFormState } from "./actions";
import { GenerateDocumentForm } from "./generate-document-form";

const initialState: AmendmentFormState = {};

const AMENDMENT_TYPE_LABELS: Record<string, string> = {
  FLOW_RENEGOTIATION: "Renegociação de fluxo",
  UNIT_CHANGE: "Alteração de unidade",
  TERM_CHANGE: "Alteração de prazo",
  OTHER: "Outro",
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function NewAmendmentForm({
  saleId,
  contractId,
  remainingBalance,
}: {
  saleId: string;
  contractId: string;
  remainingBalance: number;
}) {
  const [state, formAction, pending] = useActionState(createAmendmentAction, initialState);
  const [type, setType] = useState("FLOW_RENEGOTIATION");

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 420 }}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="contractId" value={contractId} />

      <label htmlFor="am-type">Tipo</label>
      <select id="am-type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
        {Object.entries(AMENDMENT_TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {type === "FLOW_RENEGOTIATION" ? (
        <>
          <p className="field-hint">
            Saldo ainda não recebido (o que será redistribuído): {formatCurrency(remainingBalance)}
          </p>
          <label htmlFor="am-down">Entrada do novo fluxo (%)</label>
          <input id="am-down" name="downPaymentPercent" type="number" step="0.01" defaultValue={0} />
          <label htmlFor="am-installments">Parcelas mensais</label>
          <input id="am-installments" name="monthlyInstallments" type="number" required />
          <label htmlFor="am-keys">Chaves (%)</label>
          <input id="am-keys" name="keysInstallmentPercent" type="number" step="0.01" defaultValue={0} />
        </>
      ) : null}

      <label htmlFor="am-notes">Observações</label>
      <textarea id="am-notes" name="notes" rows={2} />

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Aditivo criado como rascunho.</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Criando..." : "Criar aditivo"}
      </button>
    </form>
  );
}

export function SignAmendmentButton({ saleId, amendmentId }: { saleId: string; amendmentId: string }) {
  return (
    <form action={signAmendmentAction}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="amendmentId" value={amendmentId} />
      <button type="submit">Assinar aditivo</button>
    </form>
  );
}

export function AmendmentDocumentForm({
  saleId,
  contractId,
  amendmentId,
  templates,
}: {
  saleId: string;
  contractId: string;
  amendmentId: string;
  templates: { id: string; label: string }[];
}) {
  return <GenerateDocumentForm saleId={saleId} contractId={contractId} amendmentId={amendmentId} templates={templates} />;
}
