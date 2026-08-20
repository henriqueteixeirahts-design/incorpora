"use client";

import { useActionState } from "react";
import { createDistratoAction, signDistratoAction, type DistratoFormState } from "./actions";
import { GenerateDocumentForm } from "./generate-document-form";

const initialState: DistratoFormState = {};

type Option = { id: string; label: string };

export function NewDistratoForm({
  saleId,
  contractId,
  retentionPercent,
}: {
  saleId: string;
  contractId: string;
  retentionPercent: number;
}) {
  const [state, formAction, pending] = useActionState(createDistratoAction, initialState);

  return (
    <form action={formAction} className="inc-col" style={{ gap: "var(--inc-space-6)", maxWidth: 420 }}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="contractId" value={contractId} />

      <p className="inc-help">Retenção da incorporadora neste empreendimento: {retentionPercent}% do total pago.</p>

      <label className="inc-field">
        <span className="inc-label">Dedução — comissão de corretagem (opcional)</span>
        <input id="dt-brokerage" name="brokerageDeductionAmount" type="number" step="0.01" min="0" className="inc-input" />
      </label>

      <label className="inc-field">
        <span className="inc-label">Dedução — taxa de fruição/ocupação (opcional, se houve entrega)</span>
        <input id="dt-occupancy" name="occupancyFeeAmount" type="number" step="0.01" min="0" className="inc-input" />
      </label>

      <label className="inc-field">
        <span className="inc-label">Prazo de devolução (vencimento da conta a pagar)</span>
        <input id="dt-refund-date" name="refundDueDate" type="date" required className="inc-input" />
      </label>

      <label className="inc-field">
        <span className="inc-label">Forma de devolução (parcela única, parcelado etc.)</span>
        <input id="dt-refund-terms" name="refundTerms" type="text" className="inc-input" />
      </label>

      <label className="inc-field">
        <span className="inc-label">Motivo</span>
        <textarea id="dt-reason" name="reason" rows={2} className="inc-input" style={{ height: "auto", padding: "var(--inc-space-6)" }} />
      </label>

      {state.error ? <p className="inc-help inc-help--error">{state.error}</p> : null}
      {state.success ? (
        <p className="inc-help">Distrato calculado — confira o demonstrativo antes de assinar.</p>
      ) : null}

      <button type="submit" disabled={pending} className="inc-btn inc-btn--primary">
        {pending ? "Calculando..." : "Iniciar distrato"}
      </button>
    </form>
  );
}

export function SignDistratoButton({ saleId, distratoId }: { saleId: string; distratoId: string }) {
  return (
    <form action={signDistratoAction}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="distratoId" value={distratoId} />
      <button type="submit" className="inc-btn inc-btn--secondary inc-btn--sm">
        Assinar distrato
      </button>
    </form>
  );
}

export function DistratoDocumentForm({
  saleId,
  contractId,
  distratoId,
  templates,
}: {
  saleId: string;
  contractId: string;
  distratoId: string;
  templates: Option[];
}) {
  return (
    <GenerateDocumentForm saleId={saleId} contractId={contractId} distratoId={distratoId} templates={templates} />
  );
}
