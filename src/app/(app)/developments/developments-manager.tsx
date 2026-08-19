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
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
        <form className="inc-search" style={{ width: 320 }} action="/developments" method="get">
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="search" name="q" placeholder="Buscar por nome ou cidade" defaultValue={search} />
        </form>

        <span style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
          {total} empreendimento{total === 1 ? "" : "s"}
        </span>

        {canCreate ? (
          <button type="button" className="inc-btn inc-btn--primary" style={{ marginLeft: "auto" }} onClick={() => setModal({ mode: "create" })}>
            + Novo empreendimento
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
            <th>SPE</th>
            <th>Unidades</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {developments.length === 0 ? (
            <tr>
              <td colSpan={6} className="is-empty">
                {search ? "Nenhum empreendimento encontrado." : "Nenhum empreendimento cadastrado."}
              </td>
            </tr>
          ) : null}
          {developments.map((development) => (
            <tr key={development.id}>
              <td className="is-key">{development.name}</td>
              <td className="is-muted">{TYPE_LABELS[development.type] ?? development.type}</td>
              <td className="is-muted">
                {[development.city, development.state].filter(Boolean).join(" / ") || "—"}
              </td>
              <td>{development.speName}</td>
              <td>{development.unitsCount}</td>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }}>
                  <Link href={`/developments/${development.id}`} style={{ color: "var(--inc-brand-azul)", fontWeight: 500 }}>
                    Abrir
                  </Link>
                  {canEdit ? (
                    <button
                      type="button"
                      className="inc-btn-icon"
                      aria-label={`Editar ${development.name}`}
                      onClick={() => setModal({ mode: "edit", development })}
                    >
                      <EditIcon />
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      className="inc-btn-icon"
                      aria-label={`Excluir ${development.name}`}
                      disabled={isPending}
                      onClick={() => handleDelete(development.id, development.name)}
                      style={{ color: "var(--inc-danger)" }}
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
        {mode === "edit" && development ? (
          <input type="hidden" name="developmentId" value={development.id} />
        ) : null}
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Identificação</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px", marginBottom: "18px" }}>
          <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
            <span className="inc-label">Nome *</span>
            <input id="dev-name" name="name" className="inc-input" required defaultValue={development?.name ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Tipo *</span>
            <select id="dev-type" name="type" className="inc-select" required defaultValue={development?.type ?? ""}>
              <option value="" disabled>
                Selecione...
              </option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="inc-field">
            <span className="inc-label">SPE *</span>
            <select id="dev-spe" name="speId" className="inc-select" required defaultValue={development?.speId ?? ""}>
              <option value="" disabled>
                Selecione...
              </option>
              {spes.map((spe) => (
                <option key={spe.id} value={spe.id}>
                  {spe.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Localização</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px" }}>
          <label className="inc-field" style={{ gridColumn: "span 2" }}>
            <span className="inc-label">Cidade</span>
            <input id="dev-city" name="city" className="inc-input" defaultValue={development?.city ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">UF</span>
            <input id="dev-state" name="state" className="inc-input" maxLength={2} style={{ textTransform: "uppercase" }} defaultValue={development?.state ?? ""} />
          </label>
          <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
            <span className="inc-label">Endereço</span>
            <input id="dev-address" name="address" className="inc-input" defaultValue={development?.address ?? ""} />
          </label>
        </div>

        {state.error ? <p className="error-text" style={{ marginTop: "14px" }}>{state.error}</p> : null}
      </form>
    </Modal>
  );
}
