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
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 360 }}>
      <input type="hidden" name="saleId" value={saleId} />
      <label htmlFor="contract-notes">Observações da minuta (opcional)</label>
      <textarea id="contract-notes" name="notes" rows={2} />
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <button type="submit" disabled={pending}>
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
      <button type="submit">Enviar para assinatura</button>
    </form>
  );
}

export function ConfirmSignatureForm({ saleId, contractId }: { saleId: string; contractId: string }) {
  const [state, formAction, pending] = useActionState(confirmSignatureAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 360 }}
    >
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="contractId" value={contractId} />
      <label htmlFor="signed-url">Referência do contrato assinado (URL/arquivo)</label>
      <input
        id="signed-url"
        name="signedDocumentUrl"
        placeholder="Cole o link do PDF assinado (sem Storage configurado ainda)"
      />
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Confirmando..." : "Confirmar assinatura"}
      </button>
    </form>
  );
}
