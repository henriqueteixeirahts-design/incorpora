"use client";

import { useActionState } from "react";
import { setUnitPriceAction, type FormState } from "../actions";

const initialState: FormState = {};

type UnitOption = { id: string; number: string };

export function SetUnitPriceForm({
  developmentId,
  salesTableId,
  units,
}: {
  developmentId: string;
  salesTableId: string;
  units: UnitOption[];
}) {
  const [state, formAction, pending] = useActionState(setUnitPriceAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginTop: "1rem" }}
    >
      <input type="hidden" name="developmentId" value={developmentId} />
      <input type="hidden" name="salesTableId" value={salesTableId} />

      <select name="unitId" required defaultValue="">
        <option value="" disabled>
          Unidade...
        </option>
        {units.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.number}
          </option>
        ))}
      </select>

      <input name="price" type="number" step="0.01" placeholder="Preço (R$)" required style={{ width: 140 }} />
      <input name="pricePerSqm" type="number" step="0.01" placeholder="R$/m² (opcional)" style={{ width: 140 }} />

      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Definir preço"}
      </button>
      {state.error ? <span className="error-text">{state.error}</span> : null}
    </form>
  );
}
