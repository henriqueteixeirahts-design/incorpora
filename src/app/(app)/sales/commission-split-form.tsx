"use client";

import { useActionState } from "react";
import { addCommissionSplitAction, type FormState } from "./actions";

const initialState: FormState = {};

type Option = { id: string; label: string };

export function CommissionSplitForm({
  saleId,
  brokers,
  agencies,
}: {
  saleId: string;
  brokers: Option[];
  agencies: Option[];
}) {
  const [state, formAction, pending] = useActionState(addCommissionSplitAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center", marginTop: "0.5rem" }}
    >
      <input type="hidden" name="saleId" value={saleId} />

      <select name="beneficiaryType" required defaultValue="">
        <option value="" disabled>
          Beneficiário...
        </option>
        <option value="BROKER">Corretor</option>
        <option value="AGENCY">Imobiliária</option>
        <option value="COORDINATOR">Coordenador</option>
        <option value="MANAGER">Gerente</option>
        <option value="CAMPAIGN">Campanha</option>
      </select>

      <select name="brokerId" defaultValue="">
        <option value="">—</option>
        {brokers.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <select name="agencyId" defaultValue="">
        <option value="">—</option>
        {agencies.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <input name="label" placeholder="Nome (coordenador/campanha)" style={{ width: 160 }} />
      <input name="percent" type="number" step="0.01" placeholder="%" required style={{ width: 80 }} />

      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Lançar comissão"}
      </button>
      {state.error ? <span className="error-text">{state.error}</span> : null}
    </form>
  );
}
