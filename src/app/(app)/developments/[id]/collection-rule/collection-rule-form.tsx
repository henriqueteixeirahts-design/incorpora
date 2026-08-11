"use client";

import { useActionState, useState } from "react";
import { upsertCollectionRuleAction, type FormState } from "./actions";

const initialState: FormState = {};

type EditableStep = { offsetDays: string; actionLabel: string };

export function CollectionRuleForm({
  developmentId,
  steps,
  canEdit,
}: {
  developmentId: string;
  steps: { sequence: number; offsetDays: number; actionLabel: string }[];
  canEdit: boolean;
}) {
  const [state, dispatch, pending] = useActionState(upsertCollectionRuleAction, initialState);
  const [rows, setRows] = useState<EditableStep[]>(
    steps.map((s) => ({ offsetDays: String(s.offsetDays), actionLabel: s.actionLabel })),
  );

  if (!canEdit) {
    return (
      <div className="field-section" style={{ marginTop: "1.5rem", maxWidth: 600 }}>
        <ul>
          {steps.map((s, i) => (
            <li key={i}>
              {s.offsetDays < 0 ? `D${s.offsetDays}` : `D+${s.offsetDays}`} — {s.actionLabel}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function updateRow(index: number, field: keyof EditableStep, value: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { offsetDays: "", actionLabel: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  const stepsJson = JSON.stringify(
    rows.map((r) => ({ offsetDays: r.offsetDays === "" ? NaN : Number(r.offsetDays), actionLabel: r.actionLabel })),
  );

  return (
    <form action={dispatch} className="field-section" style={{ marginTop: "1.5rem", maxWidth: 600 }}>
      <input type="hidden" name="developmentId" value={developmentId} />
      <input type="hidden" name="stepsJson" value={stepsJson} />

      <table>
        <thead>
          <tr>
            <th>Prazo (dias — negativo = antes do vencimento)</th>
            <th>Ação sugerida</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td>
                <input
                  type="number"
                  value={row.offsetDays}
                  onChange={(e) => updateRow(index, "offsetDays", e.target.value)}
                  style={{ width: 90 }}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={row.actionLabel}
                  onChange={(e) => updateRow(index, "actionLabel", e.target.value)}
                  style={{ width: 260 }}
                />
              </td>
              <td>
                <button type="button" className="secondary" onClick={() => removeRow(index)}>
                  Remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button type="button" className="secondary" onClick={addRow} style={{ marginTop: "0.5rem" }}>
        + Adicionar etapa
      </button>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Régua salva.</p> : null}

      <div>
        <button type="submit" disabled={pending} style={{ marginTop: "1rem" }}>
          {pending ? "Salvando..." : "Salvar régua"}
        </button>
      </div>
    </form>
  );
}
