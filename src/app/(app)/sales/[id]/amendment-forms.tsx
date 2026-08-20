"use client";

import { useActionState, useState } from "react";
import { createAmendmentAction, signAmendmentAction, type AmendmentFormState } from "./actions";
import { GenerateDocumentForm } from "./generate-document-form";
import { formatCurrencyBRL } from "@/lib/format";

const initialState: AmendmentFormState = {};

const AMENDMENT_TYPE_LABELS: Record<string, string> = {
  FLOW_RENEGOTIATION: "Renegociação de fluxo",
  UNIT_CHANGE: "Alteração de unidade",
  TERM_CHANGE: "Alteração de prazo",
  OTHER: "Outro",
};

const formatCurrency = formatCurrencyBRL;

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
    <form action={formAction} className="inc-col" style={{ gap: "var(--inc-space-6)", maxWidth: 420 }}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="contractId" value={contractId} />

      <label className="inc-field">
        <span className="inc-label">Tipo</span>
        <select id="am-type" name="type" className="inc-select" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(AMENDMENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {type === "FLOW_RENEGOTIATION" ? (
        <>
          <p className="inc-help">
            Saldo ainda não recebido (o que será redistribuído): {formatCurrency(remainingBalance)}
          </p>
          <label className="inc-field">
            <span className="inc-label">Entrada do novo fluxo (%)</span>
            <input id="am-down" name="downPaymentPercent" type="number" step="0.01" defaultValue={0} className="inc-input" />
          </label>
          <label className="inc-field">
            <span className="inc-label">Parcelas mensais</span>
            <input id="am-installments" name="monthlyInstallments" type="number" required className="inc-input" />
          </label>
          <label className="inc-field">
            <span className="inc-label">Chaves (%)</span>
            <input id="am-keys" name="keysInstallmentPercent" type="number" step="0.01" defaultValue={0} className="inc-input" />
          </label>
        </>
      ) : null}

      <label className="inc-field">
        <span className="inc-label">Observações</span>
        <textarea id="am-notes" name="notes" rows={2} className="inc-input" style={{ height: "auto", padding: "var(--inc-space-6)" }} />
      </label>

      {state.error ? <p className="inc-help inc-help--error">{state.error}</p> : null}
      {state.success ? <p className="inc-help">Aditivo criado como rascunho.</p> : null}

      <button type="submit" disabled={pending} className="inc-btn inc-btn--primary">
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
      <button type="submit" className="inc-btn inc-btn--secondary inc-btn--sm">
        Assinar aditivo
      </button>
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
