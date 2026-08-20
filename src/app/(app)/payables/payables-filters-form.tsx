"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Option } from "./payables-manager";

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "CONSTRUCTION", label: "Construtora" },
  { value: "LAND", label: "Terreno" },
  { value: "PROJECTS", label: "Projetos" },
  { value: "APPROVALS", label: "Aprovações" },
  { value: "NOTARY", label: "Cartório" },
  { value: "MARKETING", label: "Marketing" },
  { value: "AGENCY", label: "Agência" },
  { value: "MEDIA", label: "Mídia" },
  { value: "SALES_BOOTH", label: "Estande de vendas" },
  { value: "SALES_BOOTH_MAINTENANCE", label: "Manutenção do estande" },
  { value: "SALES_TEAM", label: "Equipe comercial" },
  { value: "BROKERAGE", label: "Corretagem" },
  { value: "FEES", label: "Taxas" },
  { value: "TAXES", label: "Impostos" },
  { value: "LEGAL", label: "Jurídico" },
  { value: "ACCOUNTING", label: "Contabilidade" },
  { value: "INSURANCE", label: "Seguros" },
  { value: "BANK_FEES", label: "Despesas bancárias" },
  { value: "UTILITIES", label: "Concessionárias" },
  { value: "ADMINISTRATION", label: "Administração" },
  { value: "CANCELLATION_REFUND", label: "Devolução de distrato" },
  { value: "OTHER", label: "Despesas diversas" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "ENTERED", label: "Lançada" },
  { value: "REVIEWED", label: "Conferida" },
  { value: "APPROVED", label: "Aprovada" },
  { value: "SCHEDULED", label: "Programada" },
  { value: "PAID", label: "Paga" },
  { value: "RECONCILED", label: "Conciliada" },
  { value: "CANCELLED", label: "Cancelada" },
];

export type PayableFiltersValue = {
  developmentId: string;
  speId: string;
  supplierId: string;
  costCenterId: string;
  category: string;
  status: string;
  dueDateFrom: string;
  dueDateTo: string;
  minAmount: string;
  maxAmount: string;
};

export function PayablesFiltersForm({
  developments,
  spes,
  suppliers,
  costCenters,
  current,
  search,
  canApprove,
  pendingApprovalOnly,
}: {
  developments: Option[];
  spes: Option[];
  suppliers: Option[];
  costCenters: Option[];
  current: PayableFiltersValue;
  search: string;
  canApprove: boolean;
  pendingApprovalOnly: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(current);

  function set<K extends keyof PayableFiltersValue>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    Object.entries(values).forEach(([key, value]) => {
      if (value) qs.set(key, value);
    });
    router.push(`/payables${qs.toString() ? `?${qs.toString()}` : ""}`);
  }

  function togglePendingApproval() {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    Object.entries(values).forEach(([key, value]) => {
      if (value) qs.set(key, value);
    });
    if (pendingApprovalOnly) {
      qs.delete("pending");
    } else {
      qs.set("pending", "1");
    }
    router.push(`/payables${qs.toString() ? `?${qs.toString()}` : ""}`);
  }

  return (
    <div className="inc-card" style={{ padding: "14px 16px", marginBottom: "16px" }}>
      <form onSubmit={apply} style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="inc-field">
          <span className="inc-label">Empreendimento</span>
          <select
            id="pf-development"
            className="inc-select"
            value={values.developmentId}
            onChange={(e) => set("developmentId", e.target.value)}
          >
            <option value="">Todos</option>
            {developments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inc-field">
          <span className="inc-label">SPE</span>
          <select id="pf-spe" className="inc-select" value={values.speId} onChange={(e) => set("speId", e.target.value)}>
            <option value="">Todas</option>
            {spes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inc-field">
          <span className="inc-label">Fornecedor</span>
          <select
            id="pf-supplier"
            className="inc-select"
            value={values.supplierId}
            onChange={(e) => set("supplierId", e.target.value)}
          >
            <option value="">Todos</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inc-field">
          <span className="inc-label">Centro de custo</span>
          <select
            id="pf-costcenter"
            className="inc-select"
            value={values.costCenterId}
            onChange={(e) => set("costCenterId", e.target.value)}
          >
            <option value="">Todos</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inc-field">
          <span className="inc-label">Categoria</span>
          <select id="pf-category" className="inc-select" value={values.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Todas</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inc-field">
          <span className="inc-label">Status</span>
          <select id="pf-status" className="inc-select" value={values.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inc-field">
          <span className="inc-label">Vencimento de</span>
          <input
            id="pf-due-from"
            type="date"
            className="inc-input"
            value={values.dueDateFrom}
            onChange={(e) => set("dueDateFrom", e.target.value)}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">até</span>
          <input
            id="pf-due-to"
            type="date"
            className="inc-input"
            value={values.dueDateTo}
            onChange={(e) => set("dueDateTo", e.target.value)}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Valor mínimo</span>
          <input
            id="pf-min"
            type="number"
            step="0.01"
            className="inc-input"
            value={values.minAmount}
            onChange={(e) => set("minAmount", e.target.value)}
            style={{ width: 110 }}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Valor máximo</span>
          <input
            id="pf-max"
            type="number"
            step="0.01"
            className="inc-input"
            value={values.maxAmount}
            onChange={(e) => set("maxAmount", e.target.value)}
            style={{ width: 110 }}
          />
        </label>
        <button type="submit" className="inc-btn inc-btn--primary">
          Filtrar
        </button>
      </form>

      {canApprove ? (
        <button
          type="button"
          className="inc-filter-chip"
          aria-pressed={pendingApprovalOnly}
          style={{ marginTop: "12px" }}
          onClick={togglePendingApproval}
        >
          {pendingApprovalOnly ? "✓ Minhas pendências de aprovação" : "Minhas pendências de aprovação"}
        </button>
      ) : null}
    </div>
  );
}
