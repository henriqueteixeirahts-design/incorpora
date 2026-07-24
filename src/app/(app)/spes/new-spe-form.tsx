"use client";

import { useActionState } from "react";
import { createSpeAction, type CreateSpeState } from "./actions";

const initialState: CreateSpeState = {};

export function NewSpeForm() {
  const [state, formAction, pending] = useActionState(createSpeAction, initialState);

  return (
    <form
      action={formAction}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        maxWidth: 320,
        marginTop: "2rem",
      }}
    >
      <h2 style={{ fontSize: "1rem" }}>Nova SPE</h2>

      <label htmlFor="name">Nome</label>
      <input id="name" name="name" required />

      <label htmlFor="document">CNPJ</label>
      <input id="document" name="document" required />

      <label htmlFor="address">Endereço</label>
      <input id="address" name="address" />

      {state.error ? <p className="error-text">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Criar SPE"}
      </button>
    </form>
  );
}
