"use client";

import { useActionState, useEffect, useRef } from "react";
import { Modal } from "@/components/Modal";
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
  onClose,
}: {
  saleId: string;
  tableDefault: string | null;
  override: string | null;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(setDownPaymentDestinationOverrideAction, initialState);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Destino da entrada"
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
            {pending ? "Salvando..." : "Salvar destino da entrada"}
          </button>
        </>
      }
    >
      <form ref={formRef} action={formAction} className="inc-col" style={{ gap: "var(--inc-space-6)" }}>
        <input type="hidden" name="saleId" value={saleId} />

        <p className="inc-help" style={{ marginTop: 0 }}>
          Padrão da tabela de vendas: {tableDefault ? DESTINATION_LABELS[tableDefault] : "— (proposta fora de tabela)"}
        </p>

        <label className="inc-field">
          <span className="inc-label">Sobrescrever pra esta venda</span>
          <select id="dpd-destination" name="destination" className="inc-select" defaultValue={override ?? ""}>
            <option value="">Usar o padrão da tabela</option>
            <option value="SPE_ACCOUNT">{DESTINATION_LABELS.SPE_ACCOUNT}</option>
            <option value="BROKER_COMMISSION">{DESTINATION_LABELS.BROKER_COMMISSION}</option>
          </select>
        </label>

        {state.error ? <p className="inc-help inc-help--error">{state.error}</p> : null}
      </form>
    </Modal>
  );
}
