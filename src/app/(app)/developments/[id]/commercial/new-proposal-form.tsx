"use client";

import { useActionState } from "react";
import { createProposalAction, type FormState } from "./actions";

const initialState: FormState = {};

type Option = { id: string; label: string };

export function NewProposalForm({
  developmentId,
  units,
  customers,
  brokers,
  agencies,
  salesTables,
}: {
  developmentId: string;
  units: Option[];
  customers: Option[];
  brokers: Option[];
  agencies: Option[];
  salesTables: Option[];
}) {
  const [state, formAction, pending] = useActionState(createProposalAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: 360 }}
    >
      <input type="hidden" name="developmentId" value={developmentId} />

      <label htmlFor="prop-unit">Unidade</label>
      <select id="prop-unit" name="unitId" required defaultValue="">
        <option value="" disabled>
          Selecione...
        </option>
        {units.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="prop-customer">Cliente</label>
      <select id="prop-customer" name="customerId" required defaultValue="">
        <option value="" disabled>
          Selecione...
        </option>
        {customers.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="prop-table">Tabela de vendas</label>
      <select id="prop-table" name="salesTableId" defaultValue="">
        <option value="">Nenhuma (usar valor de referência)</option>
        {salesTables.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="prop-list-price">Preço de tabela (opcional, sobrepõe)</label>
      <input id="prop-list-price" name="listPriceOverride" type="number" step="0.01" />

      <label htmlFor="prop-discount">Desconto (%)</label>
      <input id="prop-discount" name="discountPercent" type="number" step="0.01" defaultValue={0} required />

      <details>
        <summary>Contra-proposta de fluxo (opcional — deixe em branco pra seguir a tabela padrão)</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
          <label htmlFor="prop-down-payment">Entrada (%)</label>
          <input id="prop-down-payment" name="proposedDownPaymentPercent" type="number" step="0.01" />
          <label htmlFor="prop-installments">Parcelas mensais</label>
          <input id="prop-installments" name="proposedMonthlyInstallments" type="number" />
          <label htmlFor="prop-keys">Chaves (%)</label>
          <input id="prop-keys" name="proposedKeysInstallmentPercent" type="number" step="0.01" />
        </div>
      </details>

      <label htmlFor="prop-broker">Corretor</label>
      <select id="prop-broker" name="brokerId" defaultValue="">
        <option value="">—</option>
        {brokers.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="prop-agency">Imobiliária</label>
      <select id="prop-agency" name="agencyId" defaultValue="">
        <option value="">—</option>
        {agencies.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="prop-notes">Observações</label>
      <textarea id="prop-notes" name="notes" rows={2} />

      {state.error ? <p className="error-text">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Criar proposta"}
      </button>
    </form>
  );
}
