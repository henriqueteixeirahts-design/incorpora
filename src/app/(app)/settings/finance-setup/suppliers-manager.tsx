"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import { createSupplierAction, updateSupplierAction, deleteSupplierAction, type FormState } from "./actions";
import type { SupplierSortField } from "@/server/finance-setup";
import { formatDateTimeBR } from "@/lib/format";

export type SupplierRow = {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  audit: { createdByName: string | null; createdAt: Date; updatedByName: string | null; updatedAt: Date };
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
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
        <form className="inc-search" style={{ width: 320 }} action="/settings/finance-setup" method="get">
          <input type="hidden" name="ssort" value={sortBy} />
          <input type="hidden" name="sdir" value={sortDir} />
          <input type="search" name="sq" placeholder="Buscar por nome ou documento" defaultValue={search} />
        </form>

        <span style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
          {total} fornecedor{total === 1 ? "" : "es"}
        </span>

        {canCreate ? (
          <button
            type="button"
            className="inc-btn inc-btn--primary"
            style={{ marginLeft: "auto" }}
            onClick={() => setModal({ mode: "create" })}
          >
            + Novo fornecedor
          </button>
        ) : null}
      </div>

      {deleteError ? <p className="error-text" style={{ marginBottom: "12px" }}>{deleteError}</p> : null}

      <div className="inc-card">
        <table className="inc-table" style={{ border: 0 }}>
          <thead>
            <tr>
              <th>
                <Link
                  href={sortLink("name")}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "inherit", textDecoration: "none" }}
                >
                  Nome
                  <SortIcon direction={sortBy === "name" ? sortDir : null} />
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
                <td colSpan={4} className="is-empty">
                  {search ? "Nenhum fornecedor encontrado." : "Nenhum fornecedor cadastrado."}
                </td>
              </tr>
            ) : null}
            {suppliers.map((supplier) => (
              <tr key={supplier.id}>
                <td className="is-key">{supplier.name}</td>
                <td className="is-muted">{supplier.document ?? "—"}</td>
                <td className="is-muted">{[supplier.email, supplier.phone].filter(Boolean).join(" · ") || "—"}</td>
                {canEdit || canDelete ? (
                  <td>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      {canEdit ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
                          aria-label={`Editar ${supplier.name}`}
                          onClick={() => setModal({ mode: "edit", supplier })}
                        >
                          <EditIcon />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
                          aria-label={`Excluir ${supplier.name}`}
                          disabled={isPending}
                          onClick={() => handleDelete(supplier.id, supplier.name)}
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
          <button type="button" className="inc-btn inc-btn--secondary" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="inc-btn inc-btn--primary" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
            {pending ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <form ref={formRef} action={dispatch}>
        {mode === "edit" && supplier ? (
          <input type="hidden" name="supplierId" value={supplier.id} />
        ) : null}
        {mode === "edit" && supplier ? (
          <p style={{ marginTop: 0, marginBottom: "12px", fontSize: "12px", color: "var(--inc-text-soft)" }}>
            Cadastrado por {supplier.audit.createdByName ?? "—"} em {formatDateTimeBR(supplier.audit.createdAt)}
            {" · "}Última alteração por {supplier.audit.updatedByName ?? "—"} em{" "}
            {formatDateTimeBR(supplier.audit.updatedAt)}
          </p>
        ) : null}
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Identificação</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
          <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
            <span className="inc-label">Nome *</span>
            <input id="supplier-name" name="name" className="inc-input" required defaultValue={supplier?.name ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Documento</span>
            <input id="supplier-document" name="document" className="inc-input" defaultValue={supplier?.document ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">E-mail</span>
            <input id="supplier-email" name="email" type="email" className="inc-input" defaultValue={supplier?.email ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Telefone</span>
            <input id="supplier-phone" name="phone" className="inc-input" defaultValue={supplier?.phone ?? ""} />
          </label>
        </div>
        {state.error ? <p className="error-text" style={{ marginTop: "14px" }}>{state.error}</p> : null}
      </form>
    </Modal>
  );
}
