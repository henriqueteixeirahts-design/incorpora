"use client";

import { useActionState } from "react";
import {
  createContractAction,
  confirmSignatureAction,
  markAwaitingSignatureAction,
  type FormState,
} from "./actions";

const initialState: FormState = {};

export function CreateContractForm({ saleId }: { saleId: string }) {
  const [state, formAction, pending] = useActionState(createContractAction, initialState);

  return (
    <form action={formAction} className="inc-col" style={{ gap: "var(--inc-space-6)", maxWidth: 360 }}>
      <input type="hidden" name="saleId" value={saleId} />
      <label className="inc-field">
        <span className="inc-label">Observações da minuta (opcional)</span>
        <textarea id="contract-notes" name="notes" rows={2} className="inc-input" style={{ height: "auto", padding: "var(--inc-space-6)" }} />
      </label>
      {state.error ? <p className="inc-help inc-help--error">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="inc-btn inc-btn--primary">
        {pending ? "Gerando..." : "Gerar minuta"}
      </button>
    </form>
  );
}

export function MarkAwaitingSignatureForm({ saleId, contractId }: { saleId: string; contractId: string }) {
  return (
    <form action={markAwaitingSignatureAction}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="contractId" value={contractId} />
      <button type="submit" className="inc-btn inc-btn--secondary">
        Enviar para assinatura
      </button>
    </form>
  );
}

export function ConfirmSignatureForm({ saleId, contractId }: { saleId: string; contractId: string }) {
  const [state, formAction, pending] = useActionState(confirmSignatureAction, initialState);

  return (
    <form action={formAction} className="inc-col" style={{ gap: "var(--inc-space-6)", maxWidth: 360 }}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="contractId" value={contractId} />
      <label className="inc-field">
        <span className="inc-label">Contrato assinado (PDF, até 10MB)</span>
        <input id="signed-document" name="signedDocument" type="file" accept="application/pdf" className="inc-input" />
      </label>
      {state.error ? <p className="inc-help inc-help--error">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="inc-btn inc-btn--primary">
        {pending ? "Enviando..." : "Confirmar assinatura"}
      </button>
    </form>
  );
}
