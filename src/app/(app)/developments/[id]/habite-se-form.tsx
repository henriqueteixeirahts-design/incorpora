"use client";

import { useActionState } from "react";
import { setDevelopmentCorrectionRuleAction, type FormState } from "./actions";

const initialState: FormState = {};

type IndexRuleOption = { id: string; name: string };

export function HabiteSeForm({
  developmentId,
  indexRules,
  current,
}: {
  developmentId: string;
  indexRules: IndexRuleOption[];
  current: {
    habiteSeDate: string | null; // yyyy-mm-dd
    postHabiteSeIndexRuleId: string | null;
    postHabiteSeMonthlyInterestPercent: number | null;
    postHabiteSeInterestType: string;
  };
}) {
  const [state, formAction, pending] = useActionState(
    setDevelopmentCorrectionRuleAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 360 }}
    >
      <input type="hidden" name="developmentId" value={developmentId} />

      <label htmlFor="habiteSeDate">Data do Habite-se</label>
      <input
        id="habiteSeDate"
        name="habiteSeDate"
        type="date"
        defaultValue={current.habiteSeDate ?? ""}
      />

      <label htmlFor="postHabiteSeIndexRuleId">Índice pós-Habite-se</label>
      <select
        id="postHabiteSeIndexRuleId"
        name="postHabiteSeIndexRuleId"
        defaultValue={current.postHabiteSeIndexRuleId ?? ""}
      >
        <option value="">Nenhum (só juros/taxa fixa)</option>
        {indexRules.map((rule) => (
          <option key={rule.id} value={rule.id}>
            {rule.name}
          </option>
        ))}
      </select>

      <label htmlFor="postHabiteSeMonthlyInterestPercent">Juros mensais pós-Habite-se (%)</label>
      <input
        id="postHabiteSeMonthlyInterestPercent"
        name="postHabiteSeMonthlyInterestPercent"
        type="number"
        step="0.01"
        defaultValue={current.postHabiteSeMonthlyInterestPercent ?? ""}
      />

      <label htmlFor="postHabiteSeInterestType">Tipo de juros pós-Habite-se</label>
      <select
        id="postHabiteSeInterestType"
        name="postHabiteSeInterestType"
        defaultValue={current.postHabiteSeInterestType}
      >
        <option value="COMPOUND">Compostos</option>
        <option value="SIMPLE">Simples</option>
      </select>

      {state.error ? <p className="error-text">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar Habite-se e correção pós-entrega"}
      </button>
    </form>
  );
}
