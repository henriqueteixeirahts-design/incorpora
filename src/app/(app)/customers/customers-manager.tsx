"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import { deleteCustomerAction, getCustomerDetailAction } from "./actions";
import { CustomerModal, type CustomerDetail } from "./customer-modal";
import type { CustomerSortField } from "@/server/customers";

export type CustomerRow = {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  document: string;
  email: string | null;
  phone: string | null;
};

type ModalState = { mode: "create" } | { mode: "edit"; customer: CustomerDetail } | null;

const SORTABLE_COLUMNS: { field: CustomerSortField; label: string }[] = [
  { field: "name", label: "Nome" },
  { field: "type", label: "Tipo" },
  { field: "document", label: "Documento" },
];

export function CustomersManager({
  customers,
  total,
  page,
  totalPages,
  search,
  sortBy,
  sortDir,
  canCreate,
  canEdit,
  canDelete,
}: {
  customers: CustomerRow[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  sortBy: CustomerSortField;
  sortDir: "asc" | "desc";
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function sortLink(field: CustomerSortField) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("sort", field);
    qs.set("dir", nextDir);
    return `/customers?${qs.toString()}`;
  }

  function pageLink(targetPage: number) {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("sort", sortBy);
    qs.set("dir", sortDir);
    qs.set("page", String(targetPage));
    return `/customers?${qs.toString()}`;
  }

  async function openEdit(customerId: string) {
    setLoadingId(customerId);
    const detail = await getCustomerDetailAction(customerId);
    setLoadingId(null);
    if (detail) setModal({ mode: "edit", customer: detail });
  }

  function handleDelete(customerId: string, name: string) {
    if (!confirm(`Excluir o cliente "${name}"? Essa ação não pode ser desfeita.`)) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteCustomerAction(customerId);
      if (result.error) setDeleteError(result.error);
    });
  }

  return (
    <>
      <div className="list-toolbar">
        <form className="list-search" action="/customers" method="get">
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
          <input
            type="search"
            name="q"
            placeholder="Buscar por nome, documento ou e-mail"
            defaultValue={search}
          />
          <button type="submit" className="secondary">
            Buscar
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
            {total} cliente{total === 1 ? "" : "s"}
          </p>
          {canCreate ? (
            <button type="button" onClick={() => setModal({ mode: "create" })}>
              + Novo cliente
            </button>
          ) : null}
        </div>
      </div>

      {deleteError ? <p className="error-text" style={{ marginBottom: "0.75rem" }}>{deleteError}</p> : null}

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
            <th>Contato</th>
            {canEdit || canDelete ? <th aria-label="Ações" /> : null}
          </tr>
        </thead>
        <tbody>
          {customers.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ opacity: 0.7 }}>
                {search ? "Nenhum cliente encontrado para essa busca." : "Nenhum cliente cadastrado."}
              </td>
            </tr>
          ) : null}
          {customers.map((customer) => (
            <tr key={customer.id}>
              <td>{customer.name}</td>
              <td>{customer.typeLabel}</td>
              <td>{customer.document}</td>
              <td>{[customer.email, customer.phone].filter(Boolean).join(" · ") || "—"}</td>
              {canEdit || canDelete ? (
                <td>
                  <div className="row-actions">
                    {canEdit ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Editar ${customer.name}`}
                        disabled={loadingId === customer.id}
                        onClick={() => openEdit(customer.id)}
                      >
                        <EditIcon />
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="icon-btn danger"
                        aria-label={`Excluir ${customer.name}`}
                        disabled={isPending}
                        onClick={() => handleDelete(customer.id, customer.name)}
                      >
                        <TrashIcon />
                      </button>
                    ) : null}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pagination">
        {page > 1 ? (
          <Link href={pageLink(page - 1)}>← Anterior</Link>
        ) : (
          <span className="disabled">← Anterior</span>
        )}
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
        <CustomerModal
          mode={modal.mode}
          customer={modal.mode === "edit" ? modal.customer : null}
          onClose={() => setModal(null)}
          onCreated={(customer) => setModal({ mode: "edit", customer })}
        />
      ) : null}
    </>
  );
}
