"use client";

import { useActionState } from "react";
import { upsertRenegotiationRuleAction, type FormState } from "./actions";
import type { RenegotiationRuleValues } from "@/server/renegotiation-rules";

const initialState: FormState = {};

const APPROVAL_LEVELS = ["COMMERCIAL", "SALES_MANAGER", "DIRECTOR", "FINANCIAL", "LEGAL", "PARTNERS"] as const;
const APPROVAL_LEVEL_LABELS: Record<string, string> = {
  COMMERCIAL: "Comercial",
  SALES_MANAGER: "Gerente comercial",
  DIRECTOR: "Diretor",
  FINANCIAL: "Financeiro",
  LEGAL: "Jurídico",
  PARTNERS: "Sócios",
};

export function RenegotiationRuleForm({
  developmentId,
  rule,
  canEdit,
}: {
  /** null = regra geral da organização (sem empreendimento específico). */
  developmentId: string | null;
  rule: RenegotiationRuleValues;
  canEdit: boolean;
}) {
  const [state, dispatch, pending] = useActionState(upsertRenegotiationRuleAction, initialState);

  if (!canEdit) {
    return (
      <div className="field-section" style={{ marginTop: "1.5rem", maxWidth: 600 }}>
        <p>Tolerância de desconto sem alçada: {rule.maxDiscountOnChargesPercent}%</p>
        <p>Prazo máximo de reparcelamento: {rule.maxTermMonths} meses</p>
        <p>Dias pra considerar acordo quebrado: {rule.brokenDealGraceDays}</p>
        <p>Reativa condições originais ao quebrar: {rule.reactivateOriginalOnBreak ? "Sim" : "Não"}</p>
        <p>Níveis de aprovação: {rule.approvalLevels.map((l) => APPROVAL_LEVEL_LABELS[l] ?? l).join(", ")}</p>
      </div>
    );
  }

  return (
    <form action={dispatch} className="field-section" style={{ marginTop: "1.5rem", maxWidth: 500 }}>
      {developmentId ? <input type="hidden" name="developmentId" value={developmentId} /> : null}

      <div className="field">
        <label htmlFor="rr-discount">Tolerância de desconto sobre encargos sem alçada (%)</label>
        <input
          id="rr-discount"
          name="maxDiscountOnChargesPercent"
          type="number"
          step="0.01"
          min="0"
          max="100"
          defaultValue={rule.maxDiscountOnChargesPercent}
        />
      </div>

      <div className="field" style={{ marginTop: "0.75rem" }}>
        <label htmlFor="rr-term">Prazo máximo de reparcelamento (meses)</label>
        <input id="rr-term" name="maxTermMonths" type="number" min="1" defaultValue={rule.maxTermMonths} />
      </div>

      <div className="field" style={{ marginTop: "0.75rem" }}>
        <label htmlFor="rr-grace">Dias sem pagamento pra considerar &quot;acordo quebrado&quot;</label>
        <input id="rr-grace" name="brokenDealGraceDays" type="number" min="1" defaultValue={rule.brokenDealGraceDays} />
      </div>

      <div className="field" style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          id="rr-reactivate"
          name="reactivateOriginalOnBreak"
          type="checkbox"
          defaultChecked={rule.reactivateOriginalOnBreak}
        />
        <label htmlFor="rr-reactivate" style={{ margin: 0 }}>
          Reativar condições originais ao quebrar o acordo
        </label>
      </div>

      <div className="field" style={{ marginTop: "0.75rem" }}>
        <p style={{ fontSize: "0.85rem", fontWeight: 500 }}>Níveis de aprovação (acima da tolerância)</p>
        {APPROVAL_LEVELS.map((level) => (
          <label key={level} style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.85rem" }}>
            <input type="checkbox" name="approvalLevels" value={level} defaultChecked={rule.approvalLevels.includes(level)} />
            {APPROVAL_LEVEL_LABELS[level]}
          </label>
        ))}
      </div>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Regra salva.</p> : null}

      <button type="submit" disabled={pending} style={{ marginTop: "1rem" }}>
        {pending ? "Salvando..." : "Salvar regra"}
      </button>
    </form>
  );
}
