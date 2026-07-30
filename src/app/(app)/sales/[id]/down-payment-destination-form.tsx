"use client";

import { useActionState } from "react";
import { setDownPaymentDestinationOverrideAction, type FormState } from "../actions";

const initialState: FormState = {};

const DESTINATION_LABELS: Record<string, string> = {
  SPE_ACCOUNT: "Conta da SPE (entrada compõe a carteira)",
  BROKER_COMMISSION: "Corretor/imobiliária (a entrada É a comissão)",
};

export function DownPaymentDestinationForm({
  saleId,
  tableDefault,
  override,
}: {
  saleId: string;
  tableDefault: string | null;
  override: string | null;
}) {
  const [state, formAction, pending] = useActionState(setDownPaymentDestinationOverrideAction, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 420 }}>
      <input type="hidden" name="saleId" value={saleId} />

      <p className="field-hint" style={{ marginTop: 0 }}>
        Padrão da tabela de vendas: {tableDefault ? DESTINATION_LABELS[tableDefault] : "— (proposta fora de tabela)"}
      </p>

      <label htmlFor="dpd-destination">Sobrescrever pra esta venda</label>
      <select id="dpd-destination" name="destination" defaultValue={override ?? ""}>
        <option value="">Usar o padrão da tabela</option>
        <option value="SPE_ACCOUNT">{DESTINATION_LABELS.SPE_ACCOUNT}</option>
        <option value="BROKER_COMMISSION">{DESTINATION_LABELS.BROKER_COMMISSION}</option>
      </select>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Destino salvo.</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar destino da entrada"}
      </button>
    </form>
  );
}
