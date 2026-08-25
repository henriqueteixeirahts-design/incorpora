"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReportFiltersForm({
  reportKey,
  developments,
  current,
}: {
  reportKey: string;
  developments: { id: string; label: string }[];
  current: { developmentId: string; dateFrom: string; dateTo: string };
}) {
  const router = useRouter();
  const [developmentId, setDevelopmentId] = useState(current.developmentId);
  const [dateFrom, setDateFrom] = useState(current.dateFrom);
  const [dateTo, setDateTo] = useState(current.dateTo);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (developmentId) qs.set("developmentId", developmentId);
    if (dateFrom) qs.set("dateFrom", dateFrom);
    if (dateTo) qs.set("dateTo", dateTo);
    router.push(`/reports/view/${reportKey}${qs.toString() ? `?${qs.toString()}` : ""}`);
  }

  return (
    <form
      onSubmit={apply}
      className="inc-card"
      style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-end", marginTop: "16px", padding: "14px var(--inc-gutter-card)" }}
    >
      <div className="inc-field">
        <label className="inc-label" htmlFor="report-development">Empreendimento</label>
        <select id="report-development" className="inc-select" value={developmentId} onChange={(e) => setDevelopmentId(e.target.value)}>
          <option value="">Todos</option>
          {developments.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="report-from">De</label>
        <input id="report-from" type="date" className="inc-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="report-to">Até</label>
        <input id="report-to" type="date" className="inc-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>
      <button type="submit" className="inc-btn inc-btn--primary">Filtrar</button>
    </form>
  );
}
