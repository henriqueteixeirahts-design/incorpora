"use client";

import { useActionState, useState } from "react";
import { createIndexRuleAction, upsertIndexValueAction, syncIndexRuleAction, type FormState } from "./actions";

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

export function SyncIndexRuleButton({ indexRuleId }: { indexRuleId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setMessage(null);
    const result = await syncIndexRuleAction(indexRuleId);
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setMessage(
      result.filled
        ? `${result.filled} mês(es) preenchido(s) com valor oficial.`
        : "Nenhum mês novo disponível no Banco Central por enquanto.",
    );
  }

  return (
    <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <button type="button" className="secondary" disabled={busy} onClick={handleClick}>
        {busy ? "Buscando..." : "Buscar do Banco Central"}
      </button>
      {message ? <span style={{ fontSize: "0.8rem", opacity: 0.8 }}>{message}</span> : null}
    </div>
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
