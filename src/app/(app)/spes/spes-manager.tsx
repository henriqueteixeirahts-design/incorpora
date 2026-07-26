"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import { createSpeAction, updateSpeAction, deleteSpeAction, type CreateSpeState } from "./actions";
import type { SpeSortField } from "@/server/spes";

export type SpeRow = {
  id: string;
  name: string;
  document: string;
  address: string | null;
};

type ModalState = { mode: "create" } | { mode: "edit"; spe: SpeRow } | null;

const SORTABLE_COLUMNS: { field: SpeSortField; label: string }[] = [
  { field: "name", label: "Nome" },
  { field: "document", label: "CNPJ" },
];

const initialState: CreateSpeState = {};

export function SpesManager({
  spes,
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
  spes: SpeRow[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  sortBy: SpeSortField;
  sortDir: "asc" | "desc";
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function sortLink(field: SpeSortField) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("sort", field);
    qs.set("dir", nextDir);
    return `/spes?${qs.toString()}`;
  }

  function pageLink(targetPage: number) {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("sort", sortBy);
    qs.set("dir", sortDir);
    qs.set("page", String(targetPage));
    return `/spes?${qs.toString()}`;
  }

  function handleDelete(speId: string, name: string) {
    if (!confirm(`Excluir a SPE "${name}"? Essa ação não pode ser desfeita.`)) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteSpeAction(speId);
      if (result.error) setDeleteError(result.error);
    });
  }

  return (
    <>
      <div className="list-toolbar">
        <form className="list-search" action="/spes" method="get">
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="search" name="q" placeholder="Buscar por nome ou CNPJ" defaultValue={search} />
          <button type="submit" className="secondary">
            Buscar
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
            {total} SPE{total === 1 ? "" : "s"}
          </p>
          {canCreate ? (
            <button type="button" onClick={() => setModal({ mode: "create" })}>
              + Nova SPE
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
            <th>Endereço</th>
            {canEdit || canDelete ? <th aria-label="Ações" /> : null}
          </tr>
        </thead>
        <tbody>
          {spes.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ opacity: 0.7 }}>
                {search ? "Nenhuma SPE encontrada para essa busca." : "Nenhuma SPE cadastrada."}
              </td>
            </tr>
          ) : null}
          {spes.map((spe) => (
            <tr key={spe.id}>
              <td>{spe.name}</td>
              <td>{spe.document}</td>
              <td>{spe.address ?? "—"}</td>
              {canEdit || canDelete ? (
                <td>
                  <div className="row-actions">
                    {canEdit ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Editar ${spe.name}`}
                        onClick={() => setModal({ mode: "edit", spe })}
                      >
                        <EditIcon />
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="icon-btn danger"
                        aria-label={`Excluir ${spe.name}`}
                        disabled={isPending}
                        onClick={() => handleDelete(spe.id, spe.name)}
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
        <SpeModal
          mode={modal.mode}
          spe={modal.mode === "edit" ? modal.spe : null}
          onClose={() => setModal(null)}
        />
      ) : null}
    </>
  );
}

function SpeModal({
  mode,
  spe,
  onClose,
}: {
  mode: "create" | "edit";
  spe: SpeRow | null;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const formAction = mode === "create" ? createSpeAction : updateSpeAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "edit" ? `Editar SPE — ${spe!.name}` : "Nova SPE"}
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
        {mode === "edit" && spe ? <input type="hidden" name="speId" value={spe.id} /> : null}

        <div className="field-section">
          <div className="field-grid">
            <div className="field">
              <label htmlFor="name">Nome *</label>
              <input id="name" name="name" required defaultValue={spe?.name ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="document">CNPJ *</label>
              <input id="document" name="document" required defaultValue={spe?.document ?? ""} />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="address">Endereço</label>
              <input id="address" name="address" defaultValue={spe?.address ?? ""} />
            </div>
          </div>
        </div>

        {state.error ? <p className="error-text">{state.error}</p> : null}
      </form>
    </Modal>
  );
}
