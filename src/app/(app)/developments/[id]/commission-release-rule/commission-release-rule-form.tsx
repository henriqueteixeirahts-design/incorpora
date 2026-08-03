"use client";

import { useActionState } from "react";
import { upsertCommissionReleaseRuleAction, type FormState } from "./actions";
import type { CommissionReleaseTrigger } from "@/generated/prisma/client";

const initialState: FormState = {};

const TRIGGER_LABELS: Record<CommissionReleaseTrigger, string> = {
  ON_CONTRACT_SIGNATURE: "Na assinatura do contrato",
  ON_DOWN_PAYMENT_RECEIVED: "No recebimento da entrada",
  ON_INSTALLMENTS_PAID_PERCENT: "Quando X% das parcelas estiverem pagas",
};

export function CommissionReleaseRuleForm({
  developmentId,
  rule,
  canEdit,
}: {
  developmentId: string;
  rule: { trigger: CommissionReleaseTrigger; installmentsPaidPercent: number };
  canEdit: boolean;
}) {
  const [state, dispatch, pending] = useActionState(upsertCommissionReleaseRuleAction, initialState);

  if (!canEdit) {
    return (
      <div className="field-section" style={{ marginTop: "1.5rem", maxWidth: 600 }}>
        <p>
          Gatilho: {TRIGGER_LABELS[rule.trigger]}
          {rule.trigger === "ON_INSTALLMENTS_PAID_PERCENT" ? ` (${rule.installmentsPaidPercent}%)` : ""}
        </p>
      </div>
    );
  }

  return (
    <form action={dispatch} className="field-section" style={{ marginTop: "1.5rem", maxWidth: 500 }}>
      <input type="hidden" name="developmentId" value={developmentId} />

      <h3>Gatilho de liberação</h3>
      <div className="field">
        <select id="crr-trigger" name="trigger" defaultValue={rule.trigger}>
          {(Object.keys(TRIGGER_LABELS) as CommissionReleaseTrigger[]).map((trigger) => (
            <option key={trigger} value={trigger}>
              {TRIGGER_LABELS[trigger]}
            </option>
          ))}
        </select>
      </div>

      <div className="field" style={{ marginTop: "0.75rem" }}>
        <label htmlFor="crr-percent">% de parcelas pagas (só usado no gatilho acima)</label>
        <input
          id="crr-percent"
          name="installmentsPaidPercent"
          type="number"
          step="1"
          min="1"
          max="100"
          defaultValue={rule.installmentsPaidPercent}
        />
      </div>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Regra salva.</p> : null}

      <button type="submit" disabled={pending} style={{ marginTop: "1rem" }}>
        {pending ? "Salvando..." : "Salvar regra"}
      </button>
    </form>
  );
}
