"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import { createAgencyAction, updateAgencyAction, deleteAgencyAction, type FormState } from "./actions";
import type { AgencySortField } from "@/server/crm";

export type AgencyRow = { id: string; name: string; document: string | null };

type ModalState = { mode: "create" } | { mode: "edit"; agency: AgencyRow } | null;

const initialState: FormState = {};

export function AgenciesManager({
  agencies,
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
  agencies: AgencyRow[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  sortBy: AgencySortField;
  sortDir: "asc" | "desc";
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function sortLink(field: AgencySortField) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    const qs = new URLSearchParams();
    if (search) qs.set("aq", search);
    qs.set("asort", field);
    qs.set("adir", nextDir);
    return `/partners?${qs.toString()}#imobiliarias`;
  }

  function pageLink(targetPage: number) {
    const qs = new URLSearchParams();
    if (search) qs.set("aq", search);
    qs.set("asort", sortBy);
    qs.set("adir", sortDir);
    qs.set("apage", String(targetPage));
    return `/partners?${qs.toString()}#imobiliarias`;
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Excluir a imobiliária "${name}"?`)) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteAgencyAction(id);
      if (result.error) setDeleteError(result.error);
    });
  }

  return (
    <div id="imobiliarias">
      <div className="list-toolbar">
        <form className="list-search" action="/partners" method="get">
          <input type="hidden" name="asort" value={sortBy} />
          <input type="hidden" name="adir" value={sortDir} />
          <input type="search" name="aq" placeholder="Buscar por nome" defaultValue={search} />
          <button type="submit" className="secondary">
            Buscar
          </button>
        </form>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
            {total} imobiliária{total === 1 ? "" : "s"}
          </p>
          {canCreate ? (
            <button type="button" onClick={() => setModal({ mode: "create" })}>
              + Nova imobiliária
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
            <th>CNPJ</th>
            {canEdit || canDelete ? <th aria-label="Ações" /> : null}
          </tr>
        </thead>
        <tbody>
          {agencies.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ opacity: 0.7 }}>
                {search ? "Nenhuma imobiliária encontrada." : "Nenhuma imobiliária cadastrada."}
              </td>
            </tr>
          ) : null}
          {agencies.map((agency) => (
            <tr key={agency.id}>
              <td>{agency.name}</td>
              <td>{agency.document ?? "—"}</td>
              {canEdit || canDelete ? (
                <td>
                  <div className="row-actions">
                    {canEdit ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Editar ${agency.name}`}
                        onClick={() => setModal({ mode: "edit", agency })}
                      >
                        <EditIcon />
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="icon-btn danger"
                        aria-label={`Excluir ${agency.name}`}
                        disabled={isPending}
                        onClick={() => handleDelete(agency.id, agency.name)}
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
        <AgencyModal
          mode={modal.mode}
          agency={modal.mode === "edit" ? modal.agency : null}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}

function AgencyModal({
  mode,
  agency,
  onClose,
}: {
  mode: "create" | "edit";
  agency: AgencyRow | null;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const formAction = mode === "create" ? createAgencyAction : updateAgencyAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "edit" ? `Editar imobiliária — ${agency!.name}` : "Nova imobiliária"}
      width={440}
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
        {mode === "edit" && agency ? <input type="hidden" name="agencyId" value={agency.id} /> : null}
        <div className="field-section">
          <div className="field-grid">
            <div className="field">
              <label htmlFor="agency-name">Nome *</label>
              <input id="agency-name" name="name" required defaultValue={agency?.name ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="agency-document">CNPJ</label>
              <input id="agency-document" name="document" defaultValue={agency?.document ?? ""} />
            </div>
          </div>
        </div>
        {state.error ? <p className="error-text">{state.error}</p> : null}
      </form>
    </Modal>
  );
}
