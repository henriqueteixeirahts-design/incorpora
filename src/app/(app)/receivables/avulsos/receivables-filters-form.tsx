"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Option } from "./receivables-manager";

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "ASSIGNMENT_FEE", label: "Taxa de cessão" },
  { value: "SPACE_RENTAL", label: "Aluguel de espaço" },
  { value: "REFUND", label: "Reembolso" },
  { value: "YIELD", label: "Rendimento" },
  { value: "OTHER", label: "Outro" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "PENDING", label: "Pendente" },
  { value: "RECEIVED", label: "Recebido" },
  { value: "CANCELLED", label: "Cancelado" },
];

export type ReceivableFiltersValue = {
  developmentId: string;
  speId: string;
  customerId: string;
  category: string;
  status: string;
  dueDateFrom: string;
  dueDateTo: string;
  minAmount: string;
  maxAmount: string;
};

export function ReceivablesFiltersForm({
  developments,
  spes,
  customers,
  current,
  search,
}: {
  developments: Option[];
  spes: Option[];
  customers: Option[];
  current: ReceivableFiltersValue;
  search: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState(current);

  function set<K extends keyof ReceivableFiltersValue>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    Object.entries(values).forEach(([key, value]) => {
      if (value) qs.set(key, value);
    });
    router.push(`/receivables/avulsos${qs.toString() ? `?${qs.toString()}` : ""}`);
  }

  return (
    <form
      onSubmit={apply}
      className="inc-card"
      style={{ marginTop: "16px", padding: "14px var(--inc-gutter-card)", display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "flex-end" }}
    >
      <div className="inc-field">
        <label className="inc-label" htmlFor="rf-development">
          Empreendimento
        </label>
        <select id="rf-development" className="inc-select" value={values.developmentId} onChange={(e) => set("developmentId", e.target.value)}>
          <option value="">Todos</option>
          {developments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="rf-spe">
          SPE
        </label>
        <select id="rf-spe" className="inc-select" value={values.speId} onChange={(e) => set("speId", e.target.value)}>
          <option value="">Todas</option>
          {spes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="rf-customer">
          Cliente/pagador
        </label>
        <select id="rf-customer" className="inc-select" value={values.customerId} onChange={(e) => set("customerId", e.target.value)}>
          <option value="">Todos</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="rf-category">
          Categoria
        </label>
        <select id="rf-category" className="inc-select" value={values.category} onChange={(e) => set("category", e.target.value)}>
          <option value="">Todas</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="rf-status">
          Status
        </label>
        <select id="rf-status" className="inc-select" value={values.status} onChange={(e) => set("status", e.target.value)}>
          <option value="">Todos</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="rf-due-from">
          Vencimento de
        </label>
        <input id="rf-due-from" type="date" className="inc-input" value={values.dueDateFrom} onChange={(e) => set("dueDateFrom", e.target.value)} />
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="rf-due-to">
          até
        </label>
        <input id="rf-due-to" type="date" className="inc-input" value={values.dueDateTo} onChange={(e) => set("dueDateTo", e.target.value)} />
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="rf-min">
          Valor mínimo
        </label>
        <input
          id="rf-min"
          type="number"
          step="0.01"
          className="inc-input"
          value={values.minAmount}
          onChange={(e) => set("minAmount", e.target.value)}
          style={{ width: 110 }}
        />
      </div>
      <div className="inc-field">
        <label className="inc-label" htmlFor="rf-max">
          Valor máximo
        </label>
        <input
          id="rf-max"
          type="number"
          step="0.01"
          className="inc-input"
          value={values.maxAmount}
          onChange={(e) => set("maxAmount", e.target.value)}
          style={{ width: 110 }}
        />
      </div>
      <button type="submit" className="inc-btn inc-btn--secondary">
        Filtrar
      </button>
    </form>
  );
}
