"use client";

import { useActionState } from "react";
import { createCustomerAction, type FormState } from "./actions";

const initialState: FormState = {};

export function NewCustomerForm() {
  const [state, formAction, pending] = useActionState(createCustomerAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: 320, marginTop: "1.5rem" }}
    >
      <h2 style={{ fontSize: "1rem" }}>Novo cliente</h2>

      <label htmlFor="type">Tipo</label>
      <select id="type" name="type" defaultValue="INDIVIDUAL">
        <option value="INDIVIDUAL">Pessoa física</option>
        <option value="COMPANY">Pessoa jurídica</option>
      </select>

      <label htmlFor="name">Nome</label>
      <input id="name" name="name" required />

      <label htmlFor="document">CPF/CNPJ</label>
      <input id="document" name="document" required />

      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" />

      <label htmlFor="phone">Telefone</label>
      <input id="phone" name="phone" />

      {state.error ? <p className="error-text">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Criar cliente"}
      </button>
    </form>
  );
}
