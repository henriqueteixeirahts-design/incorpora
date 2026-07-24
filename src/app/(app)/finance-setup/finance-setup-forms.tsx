"use client";

import { useActionState } from "react";
import { createSupplierAction, createCostCenterAction, type FormState } from "./actions";

const initialState: FormState = {};

export function NewSupplierForm() {
  const [state, formAction, pending] = useActionState(createSupplierAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: 320 }}
    >
      <h3 style={{ fontSize: "0.95rem" }}>Novo fornecedor</h3>
      <label htmlFor="supplier-name">Nome</label>
      <input id="supplier-name" name="name" required />
      <label htmlFor="supplier-document">CNPJ/CPF</label>
      <input id="supplier-document" name="document" />
      <label htmlFor="supplier-email">E-mail</label>
      <input id="supplier-email" name="email" type="email" />
      <label htmlFor="supplier-phone">Telefone</label>
      <input id="supplier-phone" name="phone" />
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Criar fornecedor"}
      </button>
    </form>
  );
}

type DevelopmentOption = { id: string; name: string };

export function NewCostCenterForm({ developments }: { developments: DevelopmentOption[] }) {
  const [state, formAction, pending] = useActionState(createCostCenterAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: 320 }}
    >
      <h3 style={{ fontSize: "0.95rem" }}>Novo centro de custo</h3>
      <label htmlFor="cc-name">Nome</label>
      <input id="cc-name" name="name" required placeholder="Ex.: Obra — Torre A" />
      <label htmlFor="cc-development">Empreendimento</label>
      <select id="cc-development" name="developmentId" defaultValue="">
        <option value="">Organização (nenhum específico)</option>
        {developments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Criar centro de custo"}
      </button>
    </form>
  );
}
