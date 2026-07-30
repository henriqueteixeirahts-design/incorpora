"use client";

import { useActionState } from "react";
import { createReservationAction, type FormState } from "./actions";

const initialState: FormState = {};

type Option = { id: string; label: string };

export function NewReservationForm({
  developmentId,
  units,
  customers,
  brokers,
  agencies,
  salesTables,
  defaultValidityHours = 48,
}: {
  developmentId: string;
  units: Option[];
  customers: Option[];
  brokers: Option[];
  agencies: Option[];
  salesTables: Option[];
  defaultValidityHours?: number;
}) {
  const [state, formAction, pending] = useActionState(createReservationAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: 360 }}
    >
      <input type="hidden" name="developmentId" value={developmentId} />

      <label htmlFor="res-unit">Unidade</label>
      <select id="res-unit" name="unitId" required defaultValue="">
        <option value="" disabled>
          Selecione...
        </option>
        {units.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="res-customer">Cliente</label>
      <select id="res-customer" name="customerId" required defaultValue="">
        <option value="" disabled>
          Selecione...
        </option>
        {customers.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="res-broker">Corretor</label>
      <select id="res-broker" name="brokerId" defaultValue="">
        <option value="">—</option>
        {brokers.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="res-agency">Imobiliária</label>
      <select id="res-agency" name="agencyId" defaultValue="">
        <option value="">—</option>
        {agencies.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="res-table">Tabela de vendas</label>
      <select id="res-table" name="salesTableId" defaultValue="">
        <option value="">—</option>
        {salesTables.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="res-hours">Validade (horas)</label>
      <input id="res-hours" name="expiresInHours" type="number" defaultValue={defaultValidityHours} min={1} />

      <label htmlFor="res-reason">Observação</label>
      <input id="res-reason" name="reason" />

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.message ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>{state.message}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Criar reserva"}
      </button>
    </form>
  );
}
