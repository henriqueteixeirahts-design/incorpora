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
    <div style={{ marginTop: "1rem" }}>
      <form
        onSubmit={apply}
        style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}
      >
        <div>
          <label htmlFor="pf-development" style={{ display: "block", fontSize: "0.8rem" }}>
            Empreendimento
          </label>
          <select
            id="pf-development"
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
        </div>
        <div>
          <label htmlFor="pf-spe" style={{ display: "block", fontSize: "0.8rem" }}>
            SPE
          </label>
          <select id="pf-spe" value={values.speId} onChange={(e) => set("speId", e.target.value)}>
            <option value="">Todas</option>
            {spes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pf-supplier" style={{ display: "block", fontSize: "0.8rem" }}>
            Fornecedor
          </label>
          <select id="pf-supplier" value={values.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
            <option value="">Todos</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pf-costcenter" style={{ display: "block", fontSize: "0.8rem" }}>
            Centro de custo
          </label>
          <select
            id="pf-costcenter"
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
        </div>
        <div>
          <label htmlFor="pf-category" style={{ display: "block", fontSize: "0.8rem" }}>
            Categoria
          </label>
          <select id="pf-category" value={values.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Todas</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pf-status" style={{ display: "block", fontSize: "0.8rem" }}>
            Status
          </label>
          <select id="pf-status" value={values.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pf-due-from" style={{ display: "block", fontSize: "0.8rem" }}>
            Vencimento de
          </label>
          <input
            id="pf-due-from"
            type="date"
            value={values.dueDateFrom}
            onChange={(e) => set("dueDateFrom", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="pf-due-to" style={{ display: "block", fontSize: "0.8rem" }}>
            até
          </label>
          <input
            id="pf-due-to"
            type="date"
            value={values.dueDateTo}
            onChange={(e) => set("dueDateTo", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="pf-min" style={{ display: "block", fontSize: "0.8rem" }}>
            Valor mínimo
          </label>
          <input
            id="pf-min"
            type="number"
            step="0.01"
            value={values.minAmount}
            onChange={(e) => set("minAmount", e.target.value)}
            style={{ width: 110 }}
          />
        </div>
        <div>
          <label htmlFor="pf-max" style={{ display: "block", fontSize: "0.8rem" }}>
            Valor máximo
          </label>
          <input
            id="pf-max"
            type="number"
            step="0.01"
            value={values.maxAmount}
            onChange={(e) => set("maxAmount", e.target.value)}
            style={{ width: 110 }}
          />
        </div>
        <button type="submit">Filtrar</button>
      </form>

      {canApprove ? (
        <button
          type="button"
          className={pendingApprovalOnly ? "" : "secondary"}
          style={{ marginTop: "0.75rem" }}
          onClick={togglePendingApproval}
        >
          {pendingApprovalOnly ? "✓ Minhas pendências de aprovação" : "Minhas pendências de aprovação"}
        </button>
      ) : null}
    </div>
  );
}
