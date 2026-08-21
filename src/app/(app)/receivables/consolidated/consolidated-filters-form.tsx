"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Option = { id: string; label: string };

export function ConsolidatedFiltersForm({
  developments,
  spes,
  current,
}: {
  developments: Option[];
  spes: Option[];
  current: { origin?: string; developmentId?: string; speId?: string; status?: string; dateFrom?: string; dateTo?: string };
}) {
  const router = useRouter();
  const [origin, setOrigin] = useState(current.origin ?? "");
  const [developmentId, setDevelopmentId] = useState(current.developmentId ?? "");
  const [speId, setSpeId] = useState(current.speId ?? "");
  const [status, setStatus] = useState(current.status ?? "");
  const [dateFrom, setDateFrom] = useState(current.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(current.dateTo ?? "");

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (origin) qs.set("origin", origin);
    if (developmentId) qs.set("developmentId", developmentId);
    if (speId) qs.set("speId", speId);
    if (status) qs.set("status", status);
    if (dateFrom) qs.set("dateFrom", dateFrom);
    if (dateTo) qs.set("dateTo", dateTo);
    router.push(`/receivables/consolidated${qs.toString() ? `?${qs.toString()}` : ""}`);
  }

  return (
    <form
      onSubmit={apply}
      className="inc-card"
      style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-end", marginTop: "16px", padding: "14px var(--inc-gutter-card)" }}
    >
      <div className="inc-field">
        <label className="inc-label" htmlFor="consolidated-origin">Origem</label>
        <select id="consolidated-origin" className="inc-select" value={origin} onChange={(e) => setOrigin(e.target.value)}>
          <option value="">Todas</option>
          <option value="SALES">Carteira de vendas</option>
          <option value="AVULSO">Recebível avulso</option>
          <option value="INVESTOR_CONTRIBUTION">Aporte de investidor</option>
        </select>
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="consolidated-development">Empreendimento</label>
        <select id="consolidated-development" className="inc-select" value={developmentId} onChange={(e) => setDevelopmentId(e.target.value)}>
          <option value="">Todos</option>
          {developments.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="consolidated-spe">SPE</label>
        <select id="consolidated-spe" className="inc-select" value={speId} onChange={(e) => setSpeId(e.target.value)}>
          <option value="">Todas</option>
          {spes.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="consolidated-status">Status</label>
        <select id="consolidated-status" className="inc-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="FORECAST">Previsto</option>
          <option value="OVERDUE">Vencido</option>
          <option value="REALIZED">Realizado</option>
        </select>
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="consolidated-from">De</label>
        <input id="consolidated-from" type="date" className="inc-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="consolidated-to">Até</label>
        <input id="consolidated-to" type="date" className="inc-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>
      <button type="submit" className="inc-btn inc-btn--primary">Filtrar</button>
    </form>
  );
}
