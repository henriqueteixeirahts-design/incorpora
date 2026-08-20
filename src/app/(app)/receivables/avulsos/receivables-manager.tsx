"use client";

import { useState } from "react";
import Link from "next/link";
import { EditIcon, SortIcon } from "@/components/icons";
import { registerReceivableReceiptAction, cancelReceivableAction, getReceivableDetailAction } from "./actions";
import { ReceivableModal, type ReceivableDetail } from "./receivable-modal";
import { ReceivablesFiltersForm, type ReceivableFiltersValue } from "./receivables-filters-form";
import type { ReceivableSortField } from "@/server/receivables-avulsos";
import { formatCurrencyBRL, formatCalendarDateBR } from "@/lib/format";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  RECEIVED: "Recebido",
  CANCELLED: "Cancelado",
};

const STATUS_CHIP: Record<string, string> = {
  PENDING: "reserva",
  RECEIVED: "contrato",
  CANCELLED: "permuta",
};

const CATEGORY_LABELS: Record<string, string> = {
  ASSIGNMENT_FEE: "Taxa de cessão",
  SPACE_RENTAL: "Aluguel de espaço",
  REFUND: "Reembolso",
  YIELD: "Rendimento",
  OTHER: "Outro",
};

export type ReceivableRow = {
  id: string;
  origin: string;
  category: string;
  developmentName: string | null;
  customerName: string | null;
  dueDate: string;
  amount: number;
  status: string;
  isFromAssignment: boolean;
};

export type Option = { id: string; label: string };

type ModalState = { mode: "create" } | { mode: "edit"; receivable: ReceivableDetail } | null;

const SORTABLE_COLUMNS: { field: ReceivableSortField; label: string }[] = [
  { field: "origin", label: "Origem" },
  { field: "dueDate", label: "Vencimento" },
  { field: "amount", label: "Valor" },
  { field: "status", label: "Status" },
];

const formatCurrency = formatCurrencyBRL;

export function ReceivablesManager({
  receivables,
  developments,
  spes,
  customers,
  total,
  page,
  totalPages,
  search,
  sortBy,
  sortDir,
  canCreate,
  canEdit,
  filters,
  exportHref,
}: {
  receivables: ReceivableRow[];
  developments: Option[];
  spes: Option[];
  customers: Option[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  sortBy: ReceivableSortField;
  sortDir: "asc" | "desc";
  canCreate: boolean;
  canEdit: boolean;
  filters: ReceivableFiltersValue;
  exportHref: string;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  function baseParams() {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    Object.entries(filters).forEach(([key, value]) => {
      if (value) qs.set(key, value);
    });
    return qs;
  }

  function sortLink(field: ReceivableSortField) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    const qs = baseParams();
    qs.set("sort", field);
    qs.set("dir", nextDir);
    return `/receivables/avulsos?${qs.toString()}`;
  }

  function pageLink(targetPage: number) {
    const qs = baseParams();
    qs.set("sort", sortBy);
    qs.set("dir", sortDir);
    qs.set("page", String(targetPage));
    return `/receivables/avulsos?${qs.toString()}`;
  }

  async function openEdit(receivableId: string) {
    setLoadingId(receivableId);
    const detail = await getReceivableDetailAction(receivableId);
    setLoadingId(null);
    if (detail) setModal({ mode: "edit", receivable: detail });
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
        <form className="inc-search" style={{ width: 320 }} action="/receivables/avulsos" method="get">
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
          {Object.entries(filters).map(([key, value]) =>
            value ? <input key={key} type="hidden" name={key} value={value} /> : null,
          )}
          <input type="search" name="q" placeholder="Buscar por origem" defaultValue={search} />
        </form>

        <span style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
          {total} {total === 1 ? "recebível avulso" : "recebíveis avulsos"}
        </span>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          <a className="inc-btn inc-btn--secondary" href={exportHref}>
            Exportar
          </a>
          {canCreate ? (
            <button type="button" className="inc-btn inc-btn--primary" onClick={() => setModal({ mode: "create" })}>
              + Novo recebível avulso
            </button>
          ) : null}
        </div>
      </div>

      <ReceivablesFiltersForm developments={developments} spes={spes} customers={customers} current={filters} search={search} />

      <div className="inc-card" style={{ marginTop: "16px" }}>
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
              <th>Categoria</th>
              <th>Cliente/pagador</th>
              <th>Empreendimento</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {receivables.length === 0 ? (
              <tr>
                <td colSpan={8} className="is-empty">
                  {search ? "Nenhum recebível encontrado." : "Nenhum recebível avulso lançado."}
                </td>
              </tr>
            ) : null}
            {receivables.map((receivable) => (
              <tr key={receivable.id}>
                <td className="is-key">{receivable.origin}</td>
                <td className="is-muted">{formatCalendarDateBR(receivable.dueDate)}</td>
                <td className="is-strong">{formatCurrency(receivable.amount)}</td>
                <td>
                  <span className={`inc-chip inc-chip--${STATUS_CHIP[receivable.status] ?? "permuta"}`}>
                    {STATUS_LABELS[receivable.status] ?? receivable.status}
                  </span>
                </td>
                <td className="is-muted">{CATEGORY_LABELS[receivable.category] ?? receivable.category}</td>
                <td>{receivable.customerName ?? "—"}</td>
                <td className="is-muted">{receivable.developmentName ?? "Organização"}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    {canEdit ? (
                      <button
                        type="button"
                        className="inc-btn-icon"
                        aria-label={`Editar ${receivable.origin}`}
                        disabled={loadingId === receivable.id}
                        onClick={() => openEdit(receivable.id)}
                      >
                        <EditIcon />
                      </button>
                    ) : null}
                    {canEdit && receivable.status === "PENDING" ? (
                      <>
                        <form action={registerReceivableReceiptAction}>
                          <input type="hidden" name="receivableId" value={receivable.id} />
                          <button type="submit" className="inc-btn inc-btn--secondary inc-btn--sm">
                            Registrar recebimento
                          </button>
                        </form>
                        <form action={cancelReceivableAction}>
                          <input type="hidden" name="receivableId" value={receivable.id} />
                          <button type="submit" className="inc-btn inc-btn--secondary inc-btn--sm">
                            Cancelar
                          </button>
                        </form>
                      </>
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
        <ReceivableModal
          mode={modal.mode}
          receivable={modal.mode === "edit" ? modal.receivable : null}
          developments={developments}
          spes={spes}
          customers={customers}
          onClose={() => setModal(null)}
          onCreated={(receivable) => setModal({ mode: "edit", receivable })}
        />
      ) : null}
    </>
  );
}
