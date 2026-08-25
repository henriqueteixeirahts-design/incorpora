"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function presetRange(preset: "month" | "quarter" | "year") {
  const now = new Date();
  const dateTo = now;
  let dateFrom: Date;
  if (preset === "month") dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (preset === "quarter") dateFrom = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  else dateFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return { dateFrom: toISODate(dateFrom), dateTo: toISODate(dateTo) };
}

export function DashboardFilters({
  developments,
  current,
}: {
  developments: { id: string; label: string }[];
  current: { developmentId?: string; dateFrom: string; dateTo: string };
}) {
  const router = useRouter();
  const [developmentId, setDevelopmentId] = useState(current.developmentId ?? "");
  const [dateFrom, setDateFrom] = useState(current.dateFrom);
  const [dateTo, setDateTo] = useState(current.dateTo);

  function navigate(next: { developmentId?: string; dateFrom: string; dateTo: string }) {
    const qs = new URLSearchParams();
    if (next.developmentId) qs.set("developmentId", next.developmentId);
    qs.set("dateFrom", next.dateFrom);
    qs.set("dateTo", next.dateTo);
    router.push(`/dashboard?${qs.toString()}`);
  }

  function applyPreset(preset: "month" | "quarter" | "year") {
    const range = presetRange(preset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
    navigate({ developmentId, ...range });
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1rem" }}>
      <div className="inc-field">
        <label className="inc-label" htmlFor="dash-development">Empreendimento</label>
        <select
          id="dash-development"
          className="inc-select"
          value={developmentId}
          onChange={(e) => {
            setDevelopmentId(e.target.value);
            navigate({ developmentId: e.target.value, dateFrom, dateTo });
          }}
        >
          <option value="">Consolidado (organização)</option>
          {developments.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      </div>
      <button type="button" className="inc-btn inc-btn--secondary" onClick={() => applyPreset("month")}>Mês atual</button>
      <button type="button" className="inc-btn inc-btn--secondary" onClick={() => applyPreset("quarter")}>Trimestre</button>
      <button type="button" className="inc-btn inc-btn--secondary" onClick={() => applyPreset("year")}>12 meses</button>
      <div className="inc-field">
        <label className="inc-label" htmlFor="dash-from">De</label>
        <input id="dash-from" type="date" className="inc-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="dash-to">Até</label>
        <input id="dash-to" type="date" className="inc-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>
      <button type="button" className="inc-btn inc-btn--primary" onClick={() => navigate({ developmentId, dateFrom, dateTo })}>
        Aplicar período
      </button>
    </div>
  );
}
