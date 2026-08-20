"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Option = { id: string; label: string };

export function AgingFiltersForm({
  developments,
  spes,
  current,
}: {
  developments: Option[];
  spes: Option[];
  current: { developmentId?: string; speId?: string; minValue?: number; maxValue?: number };
}) {
  const router = useRouter();
  const [developmentId, setDevelopmentId] = useState(current.developmentId ?? "");
  const [speId, setSpeId] = useState(current.speId ?? "");
  const [minValue, setMinValue] = useState(current.minValue?.toString() ?? "");
  const [maxValue, setMaxValue] = useState(current.maxValue?.toString() ?? "");

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (developmentId) qs.set("development", developmentId);
    if (speId) qs.set("spe", speId);
    if (minValue) qs.set("min", minValue);
    if (maxValue) qs.set("max", maxValue);
    router.push(`/receivables/overdue${qs.toString() ? `?${qs.toString()}` : ""}`);
  }

  return (
    <form
      onSubmit={apply}
      className="inc-card"
      style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-end", marginTop: "16px", padding: "14px var(--inc-gutter-card)" }}
    >
      <div className="inc-field">
        <label className="inc-label" htmlFor="aging-development">
          Empreendimento
        </label>
        <select id="aging-development" className="inc-select" value={developmentId} onChange={(e) => setDevelopmentId(e.target.value)}>
          <option value="">Todos</option>
          {developments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="aging-spe">
          SPE
        </label>
        <select id="aging-spe" className="inc-select" value={speId} onChange={(e) => setSpeId(e.target.value)}>
          <option value="">Todas</option>
          {spes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="aging-min">
          Valor mínimo
        </label>
        <input
          id="aging-min"
          type="number"
          step="0.01"
          className="inc-input"
          value={minValue}
          onChange={(e) => setMinValue(e.target.value)}
          style={{ width: 110 }}
        />
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="aging-max">
          Valor máximo
        </label>
        <input
          id="aging-max"
          type="number"
          step="0.01"
          className="inc-input"
          value={maxValue}
          onChange={(e) => setMaxValue(e.target.value)}
          style={{ width: 110 }}
        />
      </div>
      <button type="submit" className="inc-btn inc-btn--secondary">
        Filtrar
      </button>
    </form>
  );
}
