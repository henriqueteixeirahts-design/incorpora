"use client";

import { useState } from "react";
import Link from "next/link";
import { EditIcon, SortIcon } from "@/components/icons";
import { advancePayableStatusAction, cancelPayableAction, getPayableDetailAction } from "./actions";
import { PayableModal, type PayableDetail } from "./payable-modal";
import type { PayableSortField } from "@/server/payables";

const STATUS_LABELS: Record<string, string> = {
  ENTERED: "Lançada",
  REVIEWED: "Conferida",
  APPROVED: "Aprovada",
  SCHEDULED: "Programada",
  PAID: "Paga",
  RECONCILED: "Conciliada",
  CANCELLED: "Cancelada",
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

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  function sortLink(field: PayableSortField) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("sort", field);
    qs.set("dir", nextDir);
    return `/payables?${qs.toString()}`;
  }

  function pageLink(targetPage: number) {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
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
      <div className="list-toolbar">
        <form className="list-search" action="/payables" method="get">
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="search" name="q" placeholder="Buscar por descrição" defaultValue={search} />
          <button type="submit" className="secondary">
            Buscar
          </button>
        </form>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
            {total} conta{total === 1 ? "" : "s"} a pagar
          </p>
          {canCreate ? (
            <button type="button" onClick={() => setModal({ mode: "create" })}>
              + Nova conta a pagar
            </button>
          ) : null}
        </div>
      </div>

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
            <th>Empreendimento</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {payables.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ opacity: 0.7 }}>
                {search ? "Nenhuma conta encontrada." : "Nenhuma conta a pagar lançada."}
              </td>
            </tr>
          ) : null}
          {payables.map((payable) => (
            <tr key={payable.id}>
              <td>{payable.description}</td>
              <td>{new Date(payable.dueDate).toLocaleDateString("pt-BR")}</td>
              <td>{formatCurrency(payable.amount)}</td>
              <td>{STATUS_LABELS[payable.status] ?? payable.status}</td>
              <td>{payable.developmentName ?? "Organização"}</td>
              <td>
                <div className="row-actions">
                  {canEdit ? (
                    <button
                      type="button"
                      className="icon-btn"
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
                      <button type="submit" className="secondary">
                        {NEXT_ACTION_LABELS[payable.status]}
                      </button>
                    </form>
                  ) : null}
                  {canCancel && !["PAID", "RECONCILED", "CANCELLED"].includes(payable.status) ? (
                    <form action={cancelPayableAction}>
                      <input type="hidden" name="payableId" value={payable.id} />
                      <button type="submit" className="secondary">
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
        <PayableModal
          mode={modal.mode}
          payable={modal.mode === "edit" ? modal.payable : null}
          developments={developments}
          spes={spes}
          suppliers={suppliers}
          costCenters={costCenters}
          onClose={() => setModal(null)}
          onCreated={(payable) => setModal({ mode: "edit", payable })}
        />
      ) : null}
    </>
  );
}
