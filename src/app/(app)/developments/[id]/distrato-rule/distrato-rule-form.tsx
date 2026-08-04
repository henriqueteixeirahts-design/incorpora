"use client";

import { useActionState } from "react";
import { upsertDistratoRuleAction, type FormState } from "./actions";

const initialState: FormState = {};

export function DistratoRuleForm({
  developmentId,
  rule,
  cap,
  canEdit,
}: {
  developmentId: string;
  rule: { retentionPercent: number; reverseCommissionOnDistrato: boolean };
  cap: number;
  canEdit: boolean;
}) {
  const [state, dispatch, pending] = useActionState(upsertDistratoRuleAction, initialState);

  if (!canEdit) {
    return (
      <div className="field-section" style={{ marginTop: "1.5rem", maxWidth: 600 }}>
        <p>Retenção: {rule.retentionPercent}%</p>
        <p>Estorna comissão não paga ao distratar: {rule.reverseCommissionOnDistrato ? "Sim" : "Não"}</p>
      </div>
    );
  }

  return (
    <form action={dispatch} className="field-section" style={{ marginTop: "1.5rem", maxWidth: 500 }}>
      <input type="hidden" name="developmentId" value={developmentId} />

      <div className="field">
        <label htmlFor="dr-retention">% de retenção (teto legal: {cap}%)</label>
        <input
          id="dr-retention"
          name="retentionPercent"
          type="number"
          step="0.01"
          min="0"
          max={cap}
          defaultValue={rule.retentionPercent}
        />
      </div>

      <div className="field" style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          id="dr-reverse"
          name="reverseCommissionOnDistrato"
          type="checkbox"
          defaultChecked={rule.reverseCommissionOnDistrato}
        />
        <label htmlFor="dr-reverse" style={{ margin: 0 }}>
          Estornar comissões ainda não pagas ao distratar
        </label>
      </div>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Regra salva.</p> : null}

      <button type="submit" disabled={pending} style={{ marginTop: "1rem" }}>
        {pending ? "Salvando..." : "Salvar regra"}
      </button>
    </form>
  );
}
