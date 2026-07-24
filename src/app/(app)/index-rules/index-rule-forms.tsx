"use client";

import { useActionState } from "react";
import { createIndexRuleAction, upsertIndexValueAction, type FormState } from "./actions";

const initialState: FormState = {};

export function NewIndexRuleForm() {
  const [state, formAction, pending] = useActionState(createIndexRuleAction, initialState);

  return (
    <form action={formAction} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      <select name="code" required defaultValue="">
        <option value="" disabled>
          Código...
        </option>
        <option value="INCC">INCC</option>
        <option value="IPCA">IPCA</option>
        <option value="IGPM">IGP-M</option>
        <option value="FIXED">Taxa fixa</option>
      </select>
      <input name="name" placeholder="Nome (ex.: INCC-M padrão)" required style={{ width: 220 }} />
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Criar índice"}
      </button>
      {state.error ? <span className="error-text">{state.error}</span> : null}
    </form>
  );
}

type IndexRuleOption = { id: string; name: string };

export function NewIndexValueForm({ rules }: { rules: IndexRuleOption[] }) {
  const [state, formAction, pending] = useActionState(upsertIndexValueAction, initialState);

  return (
    <form action={formAction} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      <select name="indexRuleId" required defaultValue="">
        <option value="" disabled>
          Índice...
        </option>
        {rules.map((rule) => (
          <option key={rule.id} value={rule.id}>
            {rule.name}
          </option>
        ))}
      </select>
      <input name="referenceMonth" type="month" required />
      <input name="ratePercent" type="number" step="0.0001" placeholder="% no mês" required style={{ width: 120 }} />
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Lançar valor"}
      </button>
      {state.error ? <span className="error-text">{state.error}</span> : null}
    </form>
  );
}
