"use client";

import { useActionState } from "react";
import { linkUnitsAction, type FormState } from "./actions";

const initialState: FormState = {};

type UnitOption = { id: string; number: string };

export function LinkAccessoryForm({
  developmentId,
  principalUnits,
  accessoryUnits,
}: {
  developmentId: string;
  principalUnits: UnitOption[];
  accessoryUnits: UnitOption[];
}) {
  const [state, formAction, pending] = useActionState(linkUnitsAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}
    >
      <input type="hidden" name="developmentId" value={developmentId} />

      <select name="principalUnitId" required defaultValue="">
        <option value="" disabled>
          Unidade principal...
        </option>
        {principalUnits.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.number}
          </option>
        ))}
      </select>

      <select name="accessoryUnitId" required defaultValue="">
        <option value="" disabled>
          Unidade acessória...
        </option>
        {accessoryUnits.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.number}
          </option>
        ))}
      </select>

      <select name="linkType" required defaultValue="MANDATORY">
        <option value="MANDATORY">Obrigatória</option>
        <option value="OPTIONAL">Opcional</option>
        <option value="SEPARATE_SALE">Venda separada</option>
      </select>

      <select name="pricing" required defaultValue="INCLUDED_IN_PRICE">
        <option value="INCLUDED_IN_PRICE">Incluída no preço</option>
        <option value="SEPARATE_INSTRUMENT">Instrumento separado</option>
      </select>

      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Vincular"}
      </button>
      {state.error ? <span className="error-text">{state.error}</span> : null}
    </form>
  );
}
