"use client";

import { useActionState } from "react";
import { setCorrectionRuleAction, type FormState } from "./actions";

const initialState: FormState = {};

type IndexRuleOption = { id: string; name: string };

export function CorrectionRuleForm({
  saleId,
  contractId,
  indexRules,
  current,
}: {
  saleId: string;
  contractId: string;
  indexRules: IndexRuleOption[];
  current: {
    indexRuleId: string | null;
    monthlyInterestPercent: number | null;
    interestType: string;
    latePaymentFinePercent: number;
    latePaymentMonthlyInterestPercent: number;
  };
}) {
  const [state, formAction, pending] = useActionState(setCorrectionRuleAction, initialState);

  return (
    <form action={formAction} className="inc-col" style={{ gap: "var(--inc-space-6)", maxWidth: 360 }}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="contractId" value={contractId} />

      <label className="inc-field">
        <span className="inc-label">Índice (fase de obra, até o Habite-se)</span>
        <select id="indexRuleId" name="indexRuleId" className="inc-select" defaultValue={current.indexRuleId ?? ""}>
          <option value="">Nenhum (só juros/taxa fixa)</option>
          {indexRules.map((rule) => (
            <option key={rule.id} value={rule.id}>
              {rule.name}
            </option>
          ))}
        </select>
      </label>

      <label className="inc-field">
        <span className="inc-label">Juros contratuais mensais (%)</span>
        <input
          id="monthlyInterestPercent"
          name="monthlyInterestPercent"
          type="number"
          step="0.01"
          className="inc-input"
          defaultValue={current.monthlyInterestPercent ?? ""}
        />
      </label>

      <label className="inc-field">
        <span className="inc-label">Tipo de juros</span>
        <select id="interestType" name="interestType" className="inc-select" defaultValue={current.interestType}>
          <option value="COMPOUND">Compostos</option>
          <option value="SIMPLE">Simples</option>
        </select>
      </label>

      <label className="inc-field">
        <span className="inc-label">Multa por atraso (%)</span>
        <input
          id="latePaymentFinePercent"
          name="latePaymentFinePercent"
          type="number"
          step="0.01"
          className="inc-input"
          defaultValue={current.latePaymentFinePercent}
        />
      </label>

      <label className="inc-field">
        <span className="inc-label">Juros de mora ao mês (%)</span>
        <input
          id="latePaymentMonthlyInterestPercent"
          name="latePaymentMonthlyInterestPercent"
          type="number"
          step="0.01"
          className="inc-input"
          defaultValue={current.latePaymentMonthlyInterestPercent}
        />
      </label>

      {state.error ? <p className="inc-help inc-help--error">{state.error}</p> : null}

      <button type="submit" disabled={pending} className="inc-btn inc-btn--primary">
        {pending ? "Salvando..." : "Salvar regra de correção"}
      </button>
    </form>
  );
}
