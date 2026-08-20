"use client";

import { useState } from "react";
import Link from "next/link";
import { EditIcon, SortIcon } from "@/components/icons";
import { advancePayableStatusAction, cancelPayableAction, getPayableDetailAction } from "./actions";
import { PayableModal, type PayableDetail, type AllocationTemplateOption } from "./payable-modal";
import { PayablesFiltersForm, type PayableFiltersValue } from "./payables-filters-form";
import type { PayableSortField } from "@/server/payables";
import { formatCurrencyBRL, formatCalendarDateBR } from "@/lib/format";

const STATUS_LABELS: Record<string, string> = {
  ENTERED: "Lançada",
  REVIEWED: "Conferida",
  APPROVED: "Aprovada",
  SCHEDULED: "Programada",
  PAID: "Paga",
  RECONCILED: "Conciliada",
  CANCELLED: "Cancelada",
};

const STATUS_CHIP: Record<string, string> = {
  ENTERED: "permuta",
  REVIEWED: "reserva",
  APPROVED: "proposta",
  SCHEDULED: "proposta",
  PAID: "contrato",
  RECONCILED: "contrato",
  CANCELLED: "atraso",
};

const NEXT_ACTION_LABELS: Record<string, string> = {
  ENTERED: "Conferir",
  REVIEWED: "Aprovar",
  APPROVED: "Programar",
  SCHEDULED: "Marcar como paga",
  PAID: "Conciliar",
};

export type PayableRow = {
  id: string;
  description: string;
  category: string;
  developmentName: string | null;
  allocationCount: number;
  dueDate: string;
  amount: number;
  status: string;
};

export type Option = { id: string; label: string };

type ModalState = { mode: "create" } | { mode: "edit"; payable: PayableDetail } | null;

const SORTABLE_COLUMNS: { field: PayableSortField; label: string }[] = [
  { field: "description", label: "Descrição" },
  { field: "dueDate", label: "Vencimento" },
  { field: "amount", label: "Valor" },
  { field: "status", label: "Status" },
];

const formatCurrency = formatCurrencyBRL;

export function PayablesManager({
  payables,
  developments,
  spes,
  suppliers,
  costCenters,
  total,
  page,
  totalPages,
  search,
  sortBy,
  sortDir,
  canCreate,
  canEdit,
  canApprove,
  canCancel,
  filters,
  pendingApprovalOnly,
  exportHref,
  allocationTemplates,
}: {
  payables: PayableRow[];
  developments: Option[];
  spes: Option[];
  suppliers: Option[];
  costCenters: Option[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  sortBy: PayableSortField;
  sortDir: "asc" | "desc";
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canCancel: boolean;
  filters: PayableFiltersValue;
  pendingApprovalOnly: boolean;
  exportHref: string;
  allocationTemplates: AllocationTemplateOption[];
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  function baseParams() {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    Object.entries(filters).forEach(([key, value]) => {
      if (value) qs.set(key, value);
    });
    if (pendingApprovalOnly) qs.set("pending", "1");
    return qs;
  }

  function sortLink(field: PayableSortField) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    const qs = baseParams();
    qs.set("sort", field);
    qs.set("dir", nextDir);
    return `/payables?${qs.toString()}`;
  }

  function pageLink(targetPage: number) {
    const qs = baseParams();
    qs.set("sort", sortBy);
    qs.set("dir", sortDir);
    qs.set("page", String(targetPage));
    return `/payables?${qs.toString()}`;
  }

  async function openEdit(payableId: string) {
    setLoadingId(payableId);
    const detail = await getPayableDetailAction(payableId);
    setLoadingId(null);
    if (detail) setModal({ mode: "edit", payable: detail });
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
        <form className="inc-search" style={{ width: 320 }} action="/payables" method="get">
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
          {pendingApprovalOnly ? <input type="hidden" name="pending" value="1" /> : null}
          {Object.entries(filters).map(([key, value]) =>
            value ? <input key={key} type="hidden" name={key} value={value} /> : null,
          )}
          <input type="search" name="q" placeholder="Buscar por descrição" defaultValue={search} />
        </form>

        <span style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
          {total} conta{total === 1 ? "" : "s"} a pagar
        </span>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
          <a className="inc-btn inc-btn--secondary" href={exportHref}>
            Exportar
          </a>
          {canCreate ? (
            <button type="button" className="inc-btn inc-btn--primary" onClick={() => setModal({ mode: "create" })}>
              + Nova conta a pagar
            </button>
          ) : null}
        </div>
      </div>

      <PayablesFiltersForm
        developments={developments}
        spes={spes}
        suppliers={suppliers}
        costCenters={costCenters}
        current={filters}
        search={search}
        canApprove={canApprove}
        pendingApprovalOnly={pendingApprovalOnly}
      />

      <div className="inc-card">
        <table className="inc-table" style={{ border: 0 }}>
          <thead>
            <tr>
              {SORTABLE_COLUMNS.map((col) => (
                <th key={col.field}>
                  <Link
                    href={sortLink(col.field)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "inherit", textDecoration: "none" }}
                  >
                    {col.label}
                    <SortIcon direction={sortBy === col.field ? sortDir : null} />
                  </Link>
                </th>
              ))}
              <th>Empreendimento</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {payables.length === 0 ? (
              <tr>
                <td colSpan={6} className="is-empty">
                  {search ? "Nenhuma conta encontrada." : "Nenhuma conta a pagar lançada."}
                </td>
              </tr>
            ) : null}
            {payables.map((payable) => (
              <tr key={payable.id}>
                <td className="is-key">{payable.description}</td>
                <td>{formatCalendarDateBR(payable.dueDate)}</td>
                <td className="is-num">{formatCurrency(payable.amount)}</td>
                <td>
                  <span className={`inc-chip inc-chip--${STATUS_CHIP[payable.status] ?? "permuta"}`}>
                    {STATUS_LABELS[payable.status] ?? payable.status}
                  </span>
                </td>
                <td className="is-muted">
                  {payable.allocationCount > 1
                    ? `Rateado (${payable.allocationCount} destinos)`
                    : (payable.developmentName ?? "Organização")}
                </td>
                <td>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                    {canEdit ? (
                      <button
                        type="button"
                        className="inc-btn-icon"
                        aria-label={`Editar ${payable.description}`}
                        disabled={loadingId === payable.id}
                        onClick={() => openEdit(payable.id)}
                      >
                        <EditIcon />
                      </button>
                    ) : null}
                    {canApprove && NEXT_ACTION_LABELS[payable.status] ? (
                      <form action={advancePayableStatusAction}>
                        <input type="hidden" name="payableId" value={payable.id} />
                        <button type="submit" className="inc-btn inc-btn--secondary inc-btn--sm">
                          {NEXT_ACTION_LABELS[payable.status]}
                        </button>
                      </form>
                    ) : null}
                    {canCancel && !["PAID", "RECONCILED", "CANCELLED"].includes(payable.status) ? (
                      <form action={cancelPayableAction}>
                        <input type="hidden" name="payableId" value={payable.id} />
                        <button type="submit" className="inc-btn inc-btn--secondary inc-btn--sm">
                          Cancelar
                        </button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inc-table-foot">
          Página {page} de {totalPages}
          <div className="inc-pagination">
            {page > 1 ? (
              <Link href={pageLink(page - 1)}>← Anterior</Link>
            ) : (
              <span style={{ color: "var(--inc-text-placeholder)" }}>← Anterior</span>
            )}
            {page < totalPages ? (
              <Link href={pageLink(page + 1)}>Próxima →</Link>
            ) : (
              <span style={{ color: "var(--inc-text-placeholder)" }}>Próxima →</span>
            )}
          </div>
        </div>
      </div>

      {modal ? (
        <PayableModal
          mode={modal.mode}
          payable={modal.mode === "edit" ? modal.payable : null}
          developments={developments}
          spes={spes}
          suppliers={suppliers}
          costCenters={costCenters}
          allocationTemplates={allocationTemplates}
          onClose={() => setModal(null)}
          onCreated={(payable) => setModal({ mode: "edit", payable })}
        />
      ) : null}
    </>
  );
}
