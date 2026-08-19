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
  canViewStatement,
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
  canViewStatement: boolean;
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
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
        <form className="inc-search" style={{ width: 320 }} action="/customers" method="get">
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="search" name="q" placeholder="Buscar por nome, documento ou e-mail" defaultValue={search} />
        </form>

        <span style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
          {total} cliente{total === 1 ? "" : "s"}
        </span>

        {canCreate ? (
          <button type="button" className="inc-btn inc-btn--primary" style={{ marginLeft: "auto" }} onClick={() => setModal({ mode: "create" })}>
            + Novo cliente
          </button>
        ) : null}
      </div>

      {deleteError ? <p className="error-text" style={{ marginBottom: "12px" }}>{deleteError}</p> : null}

      <div className="inc-card">
        <table className="inc-table" style={{ border: 0 }}>
          <thead>
            <tr>
              {SORTABLE_COLUMNS.map((col) => (
                <th key={col.field}>
                  <Link href={sortLink(col.field)} style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "inherit", textDecoration: "none" }}>
                    {col.label}
                    <SortIcon direction={sortBy === col.field ? sortDir : null} />
                  </Link>
                </th>
              ))}
              <th>Contato</th>
              {canViewStatement ? <th>Extrato</th> : null}
              {canEdit || canDelete ? <th aria-label="Ações" /> : null}
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="is-empty">
                  {search ? "Nenhum cliente encontrado para essa busca." : "Nenhum cliente cadastrado."}
                </td>
              </tr>
            ) : null}
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td className="is-key">{customer.name}</td>
                <td className="is-muted">{customer.typeLabel}</td>
                <td>{customer.document}</td>
                <td className="is-muted">{[customer.email, customer.phone].filter(Boolean).join(" · ") || "—"}</td>
                {canViewStatement ? (
                  <td>
                    <Link href={`/customers/${customer.id}/statement`} style={{ color: "var(--inc-brand-azul)", fontWeight: 500 }}>
                      Ver extrato
                    </Link>
                  </td>
                ) : null}
                {canEdit || canDelete ? (
                  <td>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      {canEdit ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
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
                          className="inc-btn-icon"
                          aria-label={`Excluir ${customer.name}`}
                          disabled={isPending}
                          onClick={() => handleDelete(customer.id, customer.name)}
                          style={{ color: "var(--inc-danger)" }}
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
        <CustomerModal
          mode={modal.mode}
          customer={modal.mode === "edit" ? modal.customer : null}
          onClose={() => setModal(null)}
          onCreated={(customer) => setModal({ mode: "edit", customer })}
          onOpenDuplicate={openEdit}
        />
      ) : null}
    </>
  );
}
