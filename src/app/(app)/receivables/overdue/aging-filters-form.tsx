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
      style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end", marginTop: "1rem" }}
    >
      <div>
        <label htmlFor="aging-development" style={{ display: "block", fontSize: "0.8rem" }}>
          Empreendimento
        </label>
        <select id="aging-development" value={developmentId} onChange={(e) => setDevelopmentId(e.target.value)}>
          <option value="">Todos</option>
          {developments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="aging-spe" style={{ display: "block", fontSize: "0.8rem" }}>
          SPE
        </label>
        <select id="aging-spe" value={speId} onChange={(e) => setSpeId(e.target.value)}>
          <option value="">Todas</option>
          {spes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="aging-min" style={{ display: "block", fontSize: "0.8rem" }}>
          Valor mínimo
        </label>
        <input id="aging-min" type="number" step="0.01" value={minValue} onChange={(e) => setMinValue(e.target.value)} style={{ width: 110 }} />
      </div>
      <div>
        <label htmlFor="aging-max" style={{ display: "block", fontSize: "0.8rem" }}>
          Valor máximo
        </label>
        <input id="aging-max" type="number" step="0.01" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} style={{ width: 110 }} />
      </div>
      <button type="submit">Filtrar</button>
    </form>
  );
}
