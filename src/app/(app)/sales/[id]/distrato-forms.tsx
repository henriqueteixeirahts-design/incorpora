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
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 420 }}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="contractId" value={contractId} />

      <p className="field-hint">Retenção da incorporadora neste empreendimento: {retentionPercent}% do total pago.</p>

      <label htmlFor="dt-brokerage">Dedução — comissão de corretagem (opcional)</label>
      <input id="dt-brokerage" name="brokerageDeductionAmount" type="number" step="0.01" min="0" />

      <label htmlFor="dt-occupancy">Dedução — taxa de fruição/ocupação (opcional, se houve entrega)</label>
      <input id="dt-occupancy" name="occupancyFeeAmount" type="number" step="0.01" min="0" />

      <label htmlFor="dt-refund-date">Prazo de devolução (vencimento da conta a pagar)</label>
      <input id="dt-refund-date" name="refundDueDate" type="date" required />

      <label htmlFor="dt-refund-terms">Forma de devolução (parcela única, parcelado etc.)</label>
      <input id="dt-refund-terms" name="refundTerms" type="text" />

      <label htmlFor="dt-reason">Motivo</label>
      <textarea id="dt-reason" name="reason" rows={2} />

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? (
        <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Distrato calculado — confira o demonstrativo antes de assinar.</p>
      ) : null}

      <button type="submit" disabled={pending}>
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
      <button type="submit">Assinar distrato</button>
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
