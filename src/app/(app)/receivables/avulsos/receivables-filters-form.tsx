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
      style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}
    >
      <div>
        <label htmlFor="rf-development" style={{ display: "block", fontSize: "0.8rem" }}>
          Empreendimento
        </label>
        <select id="rf-development" value={values.developmentId} onChange={(e) => set("developmentId", e.target.value)}>
          <option value="">Todos</option>
          {developments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="rf-spe" style={{ display: "block", fontSize: "0.8rem" }}>
          SPE
        </label>
        <select id="rf-spe" value={values.speId} onChange={(e) => set("speId", e.target.value)}>
          <option value="">Todas</option>
          {spes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="rf-customer" style={{ display: "block", fontSize: "0.8rem" }}>
          Cliente/pagador
        </label>
        <select id="rf-customer" value={values.customerId} onChange={(e) => set("customerId", e.target.value)}>
          <option value="">Todos</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="rf-category" style={{ display: "block", fontSize: "0.8rem" }}>
          Categoria
        </label>
        <select id="rf-category" value={values.category} onChange={(e) => set("category", e.target.value)}>
          <option value="">Todas</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="rf-status" style={{ display: "block", fontSize: "0.8rem" }}>
          Status
        </label>
        <select id="rf-status" value={values.status} onChange={(e) => set("status", e.target.value)}>
          <option value="">Todos</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="rf-due-from" style={{ display: "block", fontSize: "0.8rem" }}>
          Vencimento de
        </label>
        <input id="rf-due-from" type="date" value={values.dueDateFrom} onChange={(e) => set("dueDateFrom", e.target.value)} />
      </div>
      <div>
        <label htmlFor="rf-due-to" style={{ display: "block", fontSize: "0.8rem" }}>
          até
        </label>
        <input id="rf-due-to" type="date" value={values.dueDateTo} onChange={(e) => set("dueDateTo", e.target.value)} />
      </div>
      <div>
        <label htmlFor="rf-min" style={{ display: "block", fontSize: "0.8rem" }}>
          Valor mínimo
        </label>
        <input
          id="rf-min"
          type="number"
          step="0.01"
          value={values.minAmount}
          onChange={(e) => set("minAmount", e.target.value)}
          style={{ width: 110 }}
        />
      </div>
      <div>
        <label htmlFor="rf-max" style={{ display: "block", fontSize: "0.8rem" }}>
          Valor máximo
        </label>
        <input
          id="rf-max"
          type="number"
          step="0.01"
          value={values.maxAmount}
          onChange={(e) => set("maxAmount", e.target.value)}
          style={{ width: 110 }}
        />
      </div>
      <button type="submit">Filtrar</button>
    </form>
  );
}
