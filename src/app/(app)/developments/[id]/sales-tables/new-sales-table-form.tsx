"use client";

import { useActionState } from "react";
import { createSalesTableAction, type FormState } from "./actions";

const initialState: FormState = {};

type IndexRuleOption = { id: string; name: string };

export function NewSalesTableForm({
  developmentId,
  indexRules,
}: {
  developmentId: string;
  indexRules: IndexRuleOption[];
}) {
  const [state, formAction, pending] = useActionState(createSalesTableAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: 360, marginTop: "1rem" }}
    >
      <input type="hidden" name="developmentId" value={developmentId} />

      <label htmlFor="name">Nome</label>
      <input id="name" name="name" required placeholder="Ex.: Tabela de lançamento" />

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="downPaymentPercent">Entrada (%)</label>
          <input id="downPaymentPercent" name="downPaymentPercent" type="number" step="0.01" />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="monthlyInstallments">Parcelas mensais</label>
          <input id="monthlyInstallments" name="monthlyInstallments" type="number" />
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="keysInstallmentPercent">Chaves (%)</label>
          <input id="keysInstallmentPercent" name="keysInstallmentPercent" type="number" step="0.01" />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="maxDiscountPercent">Desconto máx. (%)</label>
          <input id="maxDiscountPercent" name="maxDiscountPercent" type="number" step="0.01" />
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="commissionPercent">Comissão (%)</label>
          <input id="commissionPercent" name="commissionPercent" type="number" step="0.01" />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="indexCode">Indexador</label>
          <input id="indexCode" name="indexCode" placeholder="INCC, IPCA..." />
        </div>
      </div>

      <label htmlFor="downPaymentDestination">Destino da entrada</label>
      <select id="downPaymentDestination" name="downPaymentDestination" defaultValue="SPE_ACCOUNT">
        <option value="SPE_ACCOUNT">Conta da SPE</option>
        <option value="BROKER_COMMISSION">Corretor/imobiliária (é a comissão)</option>
      </select>

      <p className="field-hint" style={{ marginTop: "0.5rem" }}>
        Regra de correção da fase de obra (só pra projetar o fluxo nominal na avaliação de propostas —
        o contrato real define a sua própria regra depois da venda).
      </p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="preHabiteSeIndexRuleId">Índice (obra)</label>
          <select id="preHabiteSeIndexRuleId" name="preHabiteSeIndexRuleId" defaultValue="">
            <option value="">Nenhum (só juros/taxa fixa)</option>
            {indexRules.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="preHabiteSeMonthlyInterestPercent">Juros mensais (%)</label>
          <input
            id="preHabiteSeMonthlyInterestPercent"
            name="preHabiteSeMonthlyInterestPercent"
            type="number"
            step="0.01"
          />
        </div>
      </div>

      {state.error ? <p className="error-text">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Criar tabela"}
      </button>
    </form>
  );
}
