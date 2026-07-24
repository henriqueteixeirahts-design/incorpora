"use client";

import { useActionState } from "react";
import { createBuildingAction, createFloorAction, type FormState } from "./actions";

const initialState: FormState = {};

type BuildingOption = { id: string; name: string };

export function NewBuildingForm({ developmentId }: { developmentId: string }) {
  const [state, formAction, pending] = useActionState(createBuildingAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}
    >
      <input type="hidden" name="developmentId" value={developmentId} />
      <input name="name" placeholder="Nome da torre/bloco" required />
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Adicionar torre"}
      </button>
      {state.error ? <span className="error-text">{state.error}</span> : null}
    </form>
  );
}

export function NewFloorForm({
  developmentId,
  buildings,
}: {
  developmentId: string;
  buildings: BuildingOption[];
}) {
  const [state, formAction, pending] = useActionState(createFloorAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}
    >
      <input type="hidden" name="developmentId" value={developmentId} />
      <select name="buildingId" required defaultValue="">
        <option value="" disabled>
          Torre...
        </option>
        {buildings.map((building) => (
          <option key={building.id} value={building.id}>
            {building.name}
          </option>
        ))}
      </select>
      <input name="level" type="number" placeholder="Andar" required style={{ width: 90 }} />
      <input name="label" placeholder="Rótulo (opcional)" style={{ width: 140 }} />
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Adicionar pavimento"}
      </button>
      {state.error ? <span className="error-text">{state.error}</span> : null}
    </form>
  );
}
