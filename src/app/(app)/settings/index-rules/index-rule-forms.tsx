"use client";

import { useActionState, useState } from "react";
import { createIndexRuleAction, upsertIndexValueAction, syncIndexRuleAction, type FormState } from "./actions";

const initialState: FormState = {};

export function NewIndexRuleForm() {
  const [state, formAction, pending] = useActionState(createIndexRuleAction, initialState);

  return (
    <div className="inc-card">
      <div className="inc-card__head">
        <div className="inc-card__title">Novo índice</div>
      </div>
      <form action={formAction} className="inc-card__body" style={{ display: "flex", gap: "14px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="inc-field">
          <span className="inc-label">Código *</span>
          <select name="code" className="inc-select" required defaultValue="">
            <option value="" disabled>
              Código...
            </option>
            <option value="INCC">INCC</option>
            <option value="IPCA">IPCA</option>
            <option value="IGPM">IGP-M</option>
            <option value="FIXED">Taxa fixa</option>
          </select>
        </label>
        <label className="inc-field" style={{ flex: 1, minWidth: 220 }}>
          <span className="inc-label">Nome *</span>
          <input name="name" className="inc-input" placeholder="Nome (ex.: INCC-M padrão)" required />
        </label>
        <button type="submit" className="inc-btn inc-btn--primary" disabled={pending}>
          {pending ? "Salvando..." : "Criar índice"}
        </button>
        {state.error ? <span className="error-text">{state.error}</span> : null}
      </form>
    </div>
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
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" disabled={busy} onClick={handleClick}>
        {busy ? "Buscando..." : "Buscar do Banco Central"}
      </button>
      {message ? <span style={{ fontSize: "12px", color: "var(--inc-text-soft)" }}>{message}</span> : null}
    </div>
  );
}

type IndexRuleOption = { id: string; name: string };

export function NewIndexValueForm({ rules }: { rules: IndexRuleOption[] }) {
  const [state, formAction, pending] = useActionState(upsertIndexValueAction, initialState);

  return (
    <div className="inc-card">
      <div className="inc-card__head">
        <div className="inc-card__title">Lançar valor mensal</div>
      </div>
      <form action={formAction} className="inc-card__body" style={{ display: "flex", gap: "14px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="inc-field" style={{ flex: 1, minWidth: 200 }}>
          <span className="inc-label">Índice *</span>
          <select name="indexRuleId" className="inc-select" required defaultValue="">
            <option value="" disabled>
              Índice...
            </option>
            {rules.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.name}
              </option>
            ))}
          </select>
        </label>
        <label className="inc-field">
          <span className="inc-label">Mês *</span>
          <input name="referenceMonth" type="month" className="inc-input" required />
        </label>
        <label className="inc-field" style={{ width: 130 }}>
          <span className="inc-label">% no mês *</span>
          <input name="ratePercent" type="number" step="0.0001" className="inc-input" placeholder="% no mês" required />
        </label>
        <button type="submit" className="inc-btn inc-btn--primary" disabled={pending}>
          {pending ? "Salvando..." : "Lançar valor"}
        </button>
        {state.error ? <span className="error-text">{state.error}</span> : null}
      </form>
    </div>
  );
}
