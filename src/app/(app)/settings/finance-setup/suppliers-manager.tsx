"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import { createSupplierAction, updateSupplierAction, deleteSupplierAction, type FormState } from "./actions";
import type { SupplierSortField } from "@/server/finance-setup";

export type SupplierRow = {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
};

type ModalState = { mode: "create" } | { mode: "edit"; supplier: SupplierRow } | null;

const initialState: FormState = {};

export function SuppliersManager({
  suppliers,
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
  suppliers: SupplierRow[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  sortBy: SupplierSortField;
  sortDir: "asc" | "desc";
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function sortLink(field: SupplierSortField) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    const qs = new URLSearchParams();
    if (search) qs.set("sq", search);
    qs.set("ssort", field);
    qs.set("sdir", nextDir);
    return `/settings/finance-setup?${qs.toString()}#fornecedores`;
  }

  function pageLink(targetPage: number) {
    const qs = new URLSearchParams();
    if (search) qs.set("sq", search);
    qs.set("ssort", sortBy);
    qs.set("sdir", sortDir);
    qs.set("spage", String(targetPage));
    return `/settings/finance-setup?${qs.toString()}#fornecedores`;
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Excluir o fornecedor "${name}"?`)) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteSupplierAction(id);
      if (result.error) setDeleteError(result.error);
    });
  }

  return (
    <div id="fornecedores">
      <div className="list-toolbar">
        <form className="list-search" action="/settings/finance-setup" method="get">
          <input type="hidden" name="ssort" value={sortBy} />
          <input type="hidden" name="sdir" value={sortDir} />
          <input type="search" name="sq" placeholder="Buscar por nome ou documento" defaultValue={search} />
          <button type="submit" className="secondary">
            Buscar
          </button>
        </form>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
            {total} fornecedor{total === 1 ? "" : "es"}
          </p>
          {canCreate ? (
            <button type="button" onClick={() => setModal({ mode: "create" })}>
              + Novo fornecedor
            </button>
          ) : null}
        </div>
      </div>

      {deleteError ? <p className="error-text" style={{ marginBottom: "0.75rem" }}>{deleteError}</p> : null}

      <table className="data-table">
        <thead>
          <tr>
            <th className="sortable-th">
              <Link href={sortLink("name")}>
                <button type="button" tabIndex={-1}>
                  Nome
                  <SortIcon direction={sortBy === "name" ? sortDir : null} />
                </button>
              </Link>
            </th>
            <th>Documento</th>
            <th>Contato</th>
            {canEdit || canDelete ? <th aria-label="Ações" /> : null}
          </tr>
        </thead>
        <tbody>
          {suppliers.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ opacity: 0.7 }}>
                {search ? "Nenhum fornecedor encontrado." : "Nenhum fornecedor cadastrado."}
              </td>
            </tr>
          ) : null}
          {suppliers.map((supplier) => (
            <tr key={supplier.id}>
              <td>{supplier.name}</td>
              <td>{supplier.document ?? "—"}</td>
              <td>{[supplier.email, supplier.phone].filter(Boolean).join(" · ") || "—"}</td>
              {canEdit || canDelete ? (
                <td>
                  <div className="row-actions">
                    {canEdit ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Editar ${supplier.name}`}
                        onClick={() => setModal({ mode: "edit", supplier })}
                      >
                        <EditIcon />
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="icon-btn danger"
                        aria-label={`Excluir ${supplier.name}`}
                        disabled={isPending}
                        onClick={() => handleDelete(supplier.id, supplier.name)}
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
        <SupplierModal
          mode={modal.mode}
          supplier={modal.mode === "edit" ? modal.supplier : null}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}

function SupplierModal({
  mode,
  supplier,
  onClose,
}: {
  mode: "create" | "edit";
  supplier: SupplierRow | null;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const formAction = mode === "create" ? createSupplierAction : updateSupplierAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "edit" ? `Editar fornecedor — ${supplier!.name}` : "Novo fornecedor"}
      width={480}
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose}>
            Fechar
          </button>
          <button type="button" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
            {pending ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <form ref={formRef} action={dispatch}>
        {mode === "edit" && supplier ? (
          <input type="hidden" name="supplierId" value={supplier.id} />
        ) : null}
        <div className="field-section">
          <div className="field-grid">
            <div className="field">
              <label htmlFor="supplier-name">Nome *</label>
              <input id="supplier-name" name="name" required defaultValue={supplier?.name ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="supplier-document">Documento</label>
              <input id="supplier-document" name="document" defaultValue={supplier?.document ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="supplier-email">E-mail</label>
              <input id="supplier-email" name="email" type="email" defaultValue={supplier?.email ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="supplier-phone">Telefone</label>
              <input id="supplier-phone" name="phone" defaultValue={supplier?.phone ?? ""} />
            </div>
          </div>
        </div>
        {state.error ? <p className="error-text">{state.error}</p> : null}
      </form>
    </Modal>
  );
}
