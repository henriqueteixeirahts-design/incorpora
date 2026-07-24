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
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 360 }}
    >
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="contractId" value={contractId} />

      <label htmlFor="indexRuleId">Índice</label>
      <select id="indexRuleId" name="indexRuleId" defaultValue={current.indexRuleId ?? ""}>
        <option value="">Nenhum (só juros/taxa fixa)</option>
        {indexRules.map((rule) => (
          <option key={rule.id} value={rule.id}>
            {rule.name}
          </option>
        ))}
      </select>

      <label htmlFor="monthlyInterestPercent">Juros contratuais mensais (%)</label>
      <input
        id="monthlyInterestPercent"
        name="monthlyInterestPercent"
        type="number"
        step="0.01"
        defaultValue={current.monthlyInterestPercent ?? ""}
      />

      <label htmlFor="interestType">Tipo de juros</label>
      <select id="interestType" name="interestType" defaultValue={current.interestType}>
        <option value="COMPOUND">Compostos</option>
        <option value="SIMPLE">Simples</option>
      </select>

      <label htmlFor="latePaymentFinePercent">Multa por atraso (%)</label>
      <input
        id="latePaymentFinePercent"
        name="latePaymentFinePercent"
        type="number"
        step="0.01"
        defaultValue={current.latePaymentFinePercent}
      />

      <label htmlFor="latePaymentMonthlyInterestPercent">Juros de mora ao mês (%)</label>
      <input
        id="latePaymentMonthlyInterestPercent"
        name="latePaymentMonthlyInterestPercent"
        type="number"
        step="0.01"
        defaultValue={current.latePaymentMonthlyInterestPercent}
      />

      {state.error ? <p className="error-text">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar regra de correção"}
      </button>
    </form>
  );
}
