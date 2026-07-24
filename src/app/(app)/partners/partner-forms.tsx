"use client";

import { useActionState } from "react";
import { createAgencyAction, createBrokerAction, type FormState } from "./actions";

const initialState: FormState = {};

export function NewAgencyForm() {
  const [state, formAction, pending] = useActionState(createAgencyAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: 320 }}
    >
      <h3 style={{ fontSize: "0.95rem" }}>Nova imobiliária</h3>
      <label htmlFor="agency-name">Nome</label>
      <input id="agency-name" name="name" required />
      <label htmlFor="agency-document">CNPJ</label>
      <input id="agency-document" name="document" />
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Criar imobiliária"}
      </button>
    </form>
  );
}

type AgencyOption = { id: string; name: string };

export function NewBrokerForm({ agencies }: { agencies: AgencyOption[] }) {
  const [state, formAction, pending] = useActionState(createBrokerAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: 320 }}
    >
      <h3 style={{ fontSize: "0.95rem" }}>Novo corretor</h3>
      <label htmlFor="broker-name">Nome</label>
      <input id="broker-name" name="name" required />
      <label htmlFor="broker-document">CPF</label>
      <input id="broker-document" name="document" />
      <label htmlFor="broker-email">E-mail</label>
      <input id="broker-email" name="email" type="email" />
      <label htmlFor="broker-phone">Telefone</label>
      <input id="broker-phone" name="phone" />
      <label htmlFor="broker-agency">Imobiliária</label>
      <select id="broker-agency" name="agencyId" defaultValue="">
        <option value="">Autônomo (sem imobiliária)</option>
        {agencies.map((agency) => (
          <option key={agency.id} value={agency.id}>
            {agency.name}
          </option>
        ))}
      </select>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Criar corretor"}
      </button>
    </form>
  );
}
