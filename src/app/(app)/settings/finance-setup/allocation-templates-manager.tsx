"use client";

import { useState } from "react";
import { deleteAllocationTemplateAction } from "@/app/(app)/payables/actions";

export type AllocationTemplateRow = {
  id: string;
  name: string;
  destinations: { developmentName: string | null; percent: number }[];
};

export function AllocationTemplatesManager({
  templates,
  canDelete,
}: {
  templates: AllocationTemplateRow[];
  canDelete: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rows, setRows] = useState(templates);

  async function handleDelete(id: string) {
    if (!confirm("Remover este modelo de rateio? Rateios já aplicados em contas não são afetados.")) return;
    setBusyId(id);
    const result = await deleteAllocationTemplateAction(id);
    setBusyId(null);
    if (result.error) {
      alert(result.error);
      return;
    }
    setRows((prev) => prev.filter((t) => t.id !== id));
  }

  if (rows.length === 0) {
    return (
      <div className="inc-card">
        <div className="inc-card__body">
          <p style={{ margin: 0, fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
            Nenhum modelo salvo ainda — modelos são criados a partir da aba &quot;Rateio&quot; de uma conta a pagar
            (ex.: &quot;Administrativo 50/30/20&quot;), pra reaplicar em contas futuras.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="inc-card">
      <table className="inc-table" style={{ border: 0 }}>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Destinos</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="is-key">{t.name}</td>
              <td className="is-muted">
                {t.destinations
                  .map((d) => `${d.developmentName ?? "Organização"} (${d.percent}%)`)
                  .join(", ")}
              </td>
              <td>
                {canDelete ? (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="inc-btn inc-btn--danger inc-btn--sm"
                      disabled={busyId === t.id}
                      onClick={() => handleDelete(t.id)}
                    >
                      Remover
                    </button>
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
