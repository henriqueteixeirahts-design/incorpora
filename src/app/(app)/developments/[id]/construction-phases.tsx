"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createConstructionPhaseAction,
  deactivateConstructionPhaseAction,
  createConstructionMeasurementAction,
  type FormState,
} from "./actions";
import { formatCalendarDateBR } from "@/lib/format";

const initialState: FormState = {};

export type ConstructionPhaseRow = {
  id: string;
  name: string;
  sequence: number;
  weightPct: number;
  isActive: boolean;
};

export type ConstructionMeasurementRow = {
  id: string;
  measurementDate: Date;
  overallPercentComplete: number;
  notes: string | null;
  phaseValues: { phaseId: string; phaseName: string; percentComplete: number }[];
};

function NewPhaseForm({ developmentId, onSaved }: { developmentId: string; onSaved: () => void }) {
  const [state, dispatch, pending] = useActionState(createConstructionPhaseAction, initialState);

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form
      action={dispatch}
      style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap", marginTop: "0.5rem" }}
    >
      <input type="hidden" name="developmentId" value={developmentId} />
      <label>
        Nome
        <br />
        <input name="name" placeholder="Ex.: Fundação" required />
      </label>
      <label>
        Ordem
        <br />
        <input name="sequence" type="number" min="1" step="1" required style={{ width: "70px" }} />
      </label>
      <label>
        Peso (%)
        <br />
        <input name="weightPct" type="number" min="0.01" max="100" step="0.01" required style={{ width: "90px" }} />
      </label>
      <label>
        Início previsto
        <br />
        <input name="plannedStart" type="date" />
      </label>
      <label>
        Fim previsto
        <br />
        <input name="plannedEnd" type="date" />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "+ Fase"}
      </button>
      {state.error ? <p className="error-text">{state.error}</p> : null}
    </form>
  );
}

function NewMeasurementForm({
  developmentId,
  activePhases,
  onSaved,
}: {
  developmentId: string;
  activePhases: ConstructionPhaseRow[];
  onSaved: () => void;
}) {
  const [state, dispatch, pending] = useActionState(createConstructionMeasurementAction, initialState);

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  const weightSum = activePhases.reduce((sum, p) => sum + p.weightPct, 0);

  return (
    <form action={dispatch} style={{ marginTop: "0.75rem" }}>
      <input type="hidden" name="developmentId" value={developmentId} />
      <label>
        Data da medição
        <br />
        <input name="measurementDate" type="date" required />
      </label>
      {weightSum !== 100 ? (
        <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>
          Soma dos pesos das fases ativas: {weightSum}% (o % geral é ponderado proporcionalmente, mesmo que não feche em 100%).
        </p>
      ) : null}
      <table style={{ marginTop: "0.5rem", maxWidth: 500 }}>
        <thead>
          <tr>
            <th>Fase</th>
            <th>Peso</th>
            <th>% concluído</th>
          </tr>
        </thead>
        <tbody>
          {activePhases.map((phase) => (
            <tr key={phase.id}>
              <td>{phase.name}</td>
              <td>{phase.weightPct}%</td>
              <td>
                <input type="hidden" name="phaseId" value={phase.id} />
                <input
                  name={`percentComplete-${phase.id}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  defaultValue={0}
                  style={{ width: "80px" }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <label style={{ display: "block", marginTop: "0.5rem" }}>
        Observações
        <br />
        <input name="notes" style={{ width: "100%", maxWidth: 500 }} />
      </label>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <button type="submit" disabled={pending || activePhases.length === 0} style={{ marginTop: "0.5rem" }}>
        {pending ? "Salvando..." : "Lançar medição"}
      </button>
    </form>
  );
}

export function ConstructionSection({
  developmentId,
  phases,
  measurements,
  canEdit,
}: {
  developmentId: string;
  phases: ConstructionPhaseRow[];
  measurements: ConstructionMeasurementRow[];
  canEdit: boolean;
}) {
  const [showPhaseForm, setShowPhaseForm] = useState(false);
  const [showMeasurementForm, setShowMeasurementForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePhases = phases.filter((p) => p.isActive);
  const latest = measurements[0] ?? null;

  async function handleDeactivate(phaseId: string) {
    if (!confirm("Desativar esta fase? O histórico de medições já lançadas contra ela permanece.")) return;
    setError(null);
    const result = await deactivateConstructionPhaseAction(developmentId, phaseId);
    if (result.error) setError(result.error);
  }

  return (
    <div>
      {error ? <p className="error-text">{error}</p> : null}

      <p>
        <strong>Evolução física atual: </strong>
        {latest ? `${latest.overallPercentComplete}% (medição de ${formatCalendarDateBR(latest.measurementDate)})` : "sem medição lançada"}
      </p>

      <table style={{ maxWidth: 600 }}>
        <thead>
          <tr>
            <th>Ordem</th>
            <th>Fase</th>
            <th>Peso</th>
            <th>Status</th>
            {canEdit ? <th aria-label="Ações" /> : null}
          </tr>
        </thead>
        <tbody>
          {phases.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ opacity: 0.7 }}>
                Nenhuma fase cadastrada.
              </td>
            </tr>
          ) : null}
          {phases.map((phase) => (
            <tr key={phase.id}>
              <td>{phase.sequence}</td>
              <td>{phase.name}</td>
              <td>{phase.weightPct}%</td>
              <td>{phase.isActive ? "Ativa" : "Inativa"}</td>
              {canEdit ? (
                <td>
                  {phase.isActive ? (
                    <button type="button" className="secondary" onClick={() => handleDeactivate(phase.id)}>
                      Desativar
                    </button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      {canEdit ? (
        showPhaseForm ? (
          <NewPhaseForm developmentId={developmentId} onSaved={() => setShowPhaseForm(false)} />
        ) : (
          <button type="button" className="secondary" onClick={() => setShowPhaseForm(true)} style={{ marginTop: "0.5rem" }}>
            + Nova fase
          </button>
        )
      ) : null}

      <h3 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Medições de evolução física</h3>
      <table style={{ maxWidth: 700 }}>
        <thead>
          <tr>
            <th>Data</th>
            <th>% geral</th>
            <th>Observações</th>
          </tr>
        </thead>
        <tbody>
          {measurements.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ opacity: 0.7 }}>
                Nenhuma medição lançada.
              </td>
            </tr>
          ) : null}
          {measurements.map((m) => (
            <tr key={m.id}>
              <td>{formatCalendarDateBR(m.measurementDate)}</td>
              <td>{m.overallPercentComplete}%</td>
              <td>{m.notes ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {canEdit ? (
        showMeasurementForm ? (
          <NewMeasurementForm developmentId={developmentId} activePhases={activePhases} onSaved={() => setShowMeasurementForm(false)} />
        ) : (
          <button
            type="button"
            className="secondary"
            onClick={() => setShowMeasurementForm(true)}
            disabled={activePhases.length === 0}
            style={{ marginTop: "0.5rem" }}
          >
            + Lançar medição
          </button>
        )
      ) : null}
    </div>
  );
}
