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
      <div className="list-toolbar">
        <form className="list-search" action="/receivables/avulsos" method="get">
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
          {Object.entries(filters).map(([key, value]) =>
            value ? <input key={key} type="hidden" name={key} value={value} /> : null,
          )}
          <input type="search" name="q" placeholder="Buscar por origem" defaultValue={search} />
          <button type="submit" className="secondary">
            Buscar
          </button>
        </form>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
            {total} {total === 1 ? "recebível avulso" : "recebíveis avulsos"}
          </p>
          <a className="secondary" href={exportHref}>
            Exportar
          </a>
          {canCreate ? (
            <button type="button" onClick={() => setModal({ mode: "create" })}>
              + Novo recebível avulso
            </button>
          ) : null}
        </div>
      </div>

      <ReceivablesFiltersForm developments={developments} spes={spes} customers={customers} current={filters} search={search} />

      <table className="data-table">
        <thead>
          <tr>
            {SORTABLE_COLUMNS.map((col) => (
              <th key={col.field} className="sortable-th">
                <Link href={sortLink(col.field)}>
                  <button type="button" tabIndex={-1}>
                    {col.label}
                    <SortIcon direction={sortBy === col.field ? sortDir : null} />
                  </button>
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
              <td colSpan={8} style={{ opacity: 0.7 }}>
                {search ? "Nenhum recebível encontrado." : "Nenhum recebível avulso lançado."}
              </td>
            </tr>
          ) : null}
          {receivables.map((receivable) => (
            <tr key={receivable.id}>
              <td>{receivable.origin}</td>
              <td>{formatCalendarDateBR(receivable.dueDate)}</td>
              <td>{formatCurrency(receivable.amount)}</td>
              <td>{STATUS_LABELS[receivable.status] ?? receivable.status}</td>
              <td>{CATEGORY_LABELS[receivable.category] ?? receivable.category}</td>
              <td>{receivable.customerName ?? "—"}</td>
              <td>{receivable.developmentName ?? "Organização"}</td>
              <td>
                <div className="row-actions">
                  {canEdit ? (
                    <button
                      type="button"
                      className="icon-btn"
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
                        <button type="submit" className="secondary">
                          Registrar recebimento
                        </button>
                      </form>
                      <form action={cancelReceivableAction}>
                        <input type="hidden" name="receivableId" value={receivable.id} />
                        <button type="submit" className="secondary">
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

      <div className="pagination">
        {page > 1 ? <Link href={pageLink(page - 1)}>← Anterior</Link> : <span className="disabled">← Anterior</span>}
        <span>
          Página {page} de {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={pageLink(page + 1)}>Próxima →</Link>
        ) : (
          <span className="disabled">Próxima →</span>
        )}
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
