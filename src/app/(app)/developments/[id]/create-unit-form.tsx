"use client";

import { useActionState } from "react";
import { createUnitAction, type FormState } from "./actions";
import { UNIT_TYPE_LABELS } from "@/lib/unit-labels";

const initialState: FormState = {};

type FloorOption = { id: string; level: number; label: string | null };
type BuildingOption = { id: string; name: string; floors: FloorOption[] };

export function CreateUnitForm({
  developmentId,
  buildings,
}: {
  developmentId: string;
  buildings: BuildingOption[];
}) {
  const [state, formAction, pending] = useActionState(createUnitAction, initialState);

  return (
    <form
      action={formAction}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
        maxWidth: 420,
        marginTop: "1rem",
      }}
    >
      <input type="hidden" name="developmentId" value={developmentId} />

      <label htmlFor="unitType">Tipo</label>
      <select id="unitType" name="unitType" required defaultValue="">
        <option value="" disabled>
          Selecione...
        </option>
        {Object.entries(UNIT_TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input type="checkbox" name="isAccessory" />
        Unidade acessória (vaga, escaninho, depósito...)
      </label>

      <label htmlFor="number">Número/identificador</label>
      <input id="number" name="number" required placeholder="Ex.: 1201, Lote 45, G-12" />

      {buildings.length > 0 ? (
        <>
          <p style={{ fontSize: "0.8rem", opacity: 0.7, margin: "0.5rem 0 0" }}>
            Edifício vertical — opcional para lotes/unidades sem torre
          </p>
          <label htmlFor="buildingId">Torre/bloco</label>
          <select id="buildingId" name="buildingId" defaultValue="">
            <option value="">—</option>
            {buildings.map((building) => (
              <option key={building.id} value={building.id}>
                {building.name}
              </option>
            ))}
          </select>

          <label htmlFor="floorId">Pavimento</label>
          <select id="floorId" name="floorId" defaultValue="">
            <option value="">—</option>
            {buildings.flatMap((building) =>
              building.floors.map((floor) => (
                <option key={floor.id} value={floor.id}>
                  {building.name} — {floor.label ?? `Andar ${floor.level}`}
                </option>
              )),
            )}
          </select>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="bedrooms">Quartos</label>
              <input id="bedrooms" name="bedrooms" type="number" min={0} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="suites">Suítes</label>
              <input id="suites" name="suites" type="number" min={0} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="privateArea">Área privativa (m²)</label>
              <input id="privateArea" name="privateArea" type="number" step="0.01" />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="totalArea">Área total (m²)</label>
              <input id="totalArea" name="totalArea" type="number" step="0.01" />
            </div>
          </div>
        </>
      ) : null}

      <p style={{ fontSize: "0.8rem", opacity: 0.7, margin: "0.5rem 0 0" }}>
        Loteamento — preencher quando aplicável
      </p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="block">Quadra</label>
          <input id="block" name="block" />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="lotArea">Área do lote (m²)</label>
          <input id="lotArea" name="lotArea" type="number" step="0.01" />
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="frontage">Testada (m)</label>
          <input id="frontage" name="frontage" type="number" step="0.01" />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="depth">Profundidade (m)</label>
          <input id="depth" name="depth" type="number" step="0.01" />
        </div>
      </div>

      <label htmlFor="registrationNumber">Matrícula</label>
      <input id="registrationNumber" name="registrationNumber" />

      <label htmlFor="referenceValue">Valor de referência (R$)</label>
      <input id="referenceValue" name="referenceValue" type="number" step="0.01" />

      <label htmlFor="notes">Observações</label>
      <textarea id="notes" name="notes" rows={2} />

      {state.error ? <p className="error-text">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Criar unidade"}
      </button>
    </form>
  );
}
