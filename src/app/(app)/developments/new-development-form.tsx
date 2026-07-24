"use client";

import { useActionState } from "react";
import { createDevelopmentAction, type CreateDevelopmentState } from "./actions";

const initialState: CreateDevelopmentState = {};

const TYPE_OPTIONS = [
  { value: "RESIDENTIAL_BUILDING", label: "Edifício residencial" },
  { value: "COMMERCIAL_BUILDING", label: "Edifício comercial" },
  { value: "MIXED_USE", label: "Empreendimento misto" },
  { value: "HORIZONTAL_CONDOMINIUM", label: "Condomínio horizontal de lotes" },
  { value: "SUBDIVISION", label: "Loteamento" },
  { value: "OTHER", label: "Outro" },
];

type SpeOption = { id: string; name: string };

export function NewDevelopmentForm({ spes }: { spes: SpeOption[] }) {
  const [state, formAction, pending] = useActionState(
    createDevelopmentAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        maxWidth: 360,
        marginTop: "2rem",
      }}
    >
      <h2 style={{ fontSize: "1rem" }}>Novo empreendimento</h2>

      <label htmlFor="speId">SPE</label>
      <select id="speId" name="speId" required defaultValue="">
        <option value="" disabled>
          Selecione...
        </option>
        {spes.map((spe) => (
          <option key={spe.id} value={spe.id}>
            {spe.name}
          </option>
        ))}
      </select>

      <label htmlFor="name">Nome</label>
      <input id="name" name="name" required />

      <label htmlFor="type">Tipo</label>
      <select id="type" name="type" required defaultValue="">
        <option value="" disabled>
          Selecione...
        </option>
        {TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="city">Cidade</label>
      <input id="city" name="city" />

      <label htmlFor="state">UF</label>
      <input id="state" name="state" maxLength={2} />

      <label htmlFor="address">Endereço</label>
      <input id="address" name="address" />

      {state.error ? <p className="error-text">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Criar empreendimento"}
      </button>
    </form>
  );
}
