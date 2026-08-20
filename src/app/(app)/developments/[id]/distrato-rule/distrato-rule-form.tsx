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
  /** null = regra geral da organização (sem empreendimento específico). */
  developmentId: string | null;
  rule: { retentionPercent: number; reverseCommissionOnDistrato: boolean };
  cap: number;
  canEdit: boolean;
}) {
  const [state, dispatch, pending] = useActionState(upsertDistratoRuleAction, initialState);

  if (!canEdit) {
    return (
      <div className="inc-card" style={{ marginTop: "16px", maxWidth: 520 }}>
        <div className="inc-card__body">
          <p>Retenção: {rule.retentionPercent}%</p>
          <p>Estorna comissão não paga ao distratar: {rule.reverseCommissionOnDistrato ? "Sim" : "Não"}</p>
        </div>
      </div>
    );
  }

  return (
    <form action={dispatch} className="inc-card" style={{ marginTop: "16px", maxWidth: 480 }}>
      <div className="inc-card__body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {developmentId ? <input type="hidden" name="developmentId" value={developmentId} /> : null}

        <label className="inc-field" htmlFor="dr-retention">
          <span className="inc-label">% de retenção (teto legal: {cap}%)</span>
          <input
            id="dr-retention"
            name="retentionPercent"
            className="inc-input"
            type="number"
            step="0.01"
            min="0"
            max={cap}
            defaultValue={rule.retentionPercent}
          />
        </label>

        <label htmlFor="dr-reverse" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--inc-fs-sm)" }}>
          <input id="dr-reverse" name="reverseCommissionOnDistrato" type="checkbox" defaultChecked={rule.reverseCommissionOnDistrato} />
          Estornar comissões ainda não pagas ao distratar
        </label>

        {state.error ? <p className="error-text">{state.error}</p> : null}
        {state.success ? <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-secondary)" }}>Regra salva.</p> : null}

        <button type="submit" className="inc-btn inc-btn--primary" disabled={pending} style={{ alignSelf: "flex-start" }}>
          {pending ? "Salvando..." : "Salvar regra"}
        </button>
      </div>
    </form>
  );
}
