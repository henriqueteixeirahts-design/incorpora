"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import {
  createDevelopmentAction,
  updateDevelopmentAction,
  deleteDevelopmentAction,
  type CreateDevelopmentState,
} from "./actions";
import type { DevelopmentSortField } from "@/server/developments";

const TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL_BUILDING: "Edifício residencial",
  COMMERCIAL_BUILDING: "Edifício comercial",
  MIXED_USE: "Empreendimento misto",
  HORIZONTAL_CONDOMINIUM: "Condomínio horizontal de lotes",
  SUBDIVISION: "Loteamento",
  OTHER: "Outro",
};

export type DevelopmentRow = {
  id: string;
  name: string;
  type: string;
  city: string | null;
  state: string | null;
  address: string | null;
  speId: string;
  speName: string;
  unitsCount: number;
};

export type SpeOption = { id: string; name: string };

type ModalState = { mode: "create" } | { mode: "edit"; development: DevelopmentRow } | null;

const initialState: CreateDevelopmentState = {};

const SORTABLE_COLUMNS: { field: DevelopmentSortField; label: string }[] = [
  { field: "name", label: "Nome" },
  { field: "type", label: "Tipo" },
  { field: "city", label: "Cidade" },
];

export function DevelopmentsManager({
  developments,
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
  developments: DevelopmentRow[];
  spes: SpeOption[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  sortBy: DevelopmentSortField;
  sortDir: "asc" | "desc";
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function sortLink(field: DevelopmentSortField) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("sort", field);
    qs.set("dir", nextDir);
    return `/developments?${qs.toString()}`;
  }

  function pageLink(targetPage: number) {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("sort", sortBy);
    qs.set("dir", sortDir);
    qs.set("page", String(targetPage));
    return `/developments?${qs.toString()}`;
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Excluir o empreendimento "${name}"? Essa ação não pode ser desfeita.`)) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteDevelopmentAction(id);
      if (result.error) setDeleteError(result.error);
    });
  }

  return (
    <>
      <div className="list-toolbar">
        <form className="list-search" action="/developments" method="get">
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="search" name="q" placeholder="Buscar por nome ou cidade" defaultValue={search} />
          <button type="submit" className="secondary">
            Buscar
          </button>
        </form>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
            {total} empreendimento{total === 1 ? "" : "s"}
          </p>
          {canCreate ? (
            <button type="button" onClick={() => setModal({ mode: "create" })}>
              + Novo empreendimento
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
            <th>SPE</th>
            <th>Unidades</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {developments.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ opacity: 0.7 }}>
                {search ? "Nenhum empreendimento encontrado." : "Nenhum empreendimento cadastrado."}
              </td>
            </tr>
          ) : null}
          {developments.map((development) => (
            <tr key={development.id}>
              <td>{development.name}</td>
              <td>{TYPE_LABELS[development.type] ?? development.type}</td>
              <td>{development.speName}</td>
              <td>{development.unitsCount}</td>
              <td>
                <div className="row-actions">
                  <Link href={`/developments/${development.id}`}>Abrir</Link>
                  {canEdit ? (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Editar ${development.name}`}
                      onClick={() => setModal({ mode: "edit", development })}
                    >
                      <EditIcon />
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label={`Excluir ${development.name}`}
                      disabled={isPending}
                      onClick={() => handleDelete(development.id, development.name)}
                    >
                      <TrashIcon />
                    </button>
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
        <DevelopmentModal
          mode={modal.mode}
          development={modal.mode === "edit" ? modal.development : null}
          spes={spes}
          onClose={() => setModal(null)}
        />
      ) : null}
    </>
  );
}

function DevelopmentModal({
  mode,
  development,
  spes,
  onClose,
}: {
  mode: "create" | "edit";
  development: DevelopmentRow | null;
  spes: SpeOption[];
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const formAction = mode === "create" ? createDevelopmentAction : updateDevelopmentAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "edit" ? `Editar empreendimento — ${development!.name}` : "Novo empreendimento"}
      width={560}
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
        {mode === "edit" && development ? (
          <input type="hidden" name="developmentId" value={development.id} />
        ) : null}
        <div className="field-section">
          <div className="field-grid">
            <div className="field">
              <label htmlFor="dev-name">Nome *</label>
              <input id="dev-name" name="name" required defaultValue={development?.name ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="dev-type">Tipo *</label>
              <select id="dev-type" name="type" required defaultValue={development?.type ?? ""}>
                <option value="" disabled>
                  Selecione...
                </option>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="dev-spe">SPE *</label>
              <select id="dev-spe" name="speId" required defaultValue={development?.speId ?? ""}>
                <option value="" disabled>
                  Selecione...
                </option>
                {spes.map((spe) => (
                  <option key={spe.id} value={spe.id}>
                    {spe.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="dev-city">Cidade</label>
              <input id="dev-city" name="city" defaultValue={development?.city ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="dev-state">UF</label>
              <input id="dev-state" name="state" maxLength={2} defaultValue={development?.state ?? ""} />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="dev-address">Endereço</label>
              <input id="dev-address" name="address" defaultValue={development?.address ?? ""} />
            </div>
          </div>
        </div>
        {state.error ? <p className="error-text">{state.error}</p> : null}
      </form>
    </Modal>
  );
}
