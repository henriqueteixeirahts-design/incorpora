"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import { deleteSpeAction, getSpeDetailAction } from "./actions";
import { SpeModal, type SpeDetail } from "./spe-modal";
import type { SpeSortField } from "@/server/spes";

export type SpeRow = {
  id: string;
  name: string;
  document: string;
  status: string;
  city: string | null;
  state: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  IN_FORMATION: "Em constituição",
  CLOSED: "Encerrada",
};

type ModalState = { mode: "create" } | { mode: "edit"; spe: SpeDetail } | null;

const SORTABLE_COLUMNS: { field: SpeSortField; label: string }[] = [
  { field: "name", label: "Nome" },
  { field: "document", label: "CNPJ" },
];

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
  const [loadingId, setLoadingId] = useState<string | null>(null);
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

  async function openEdit(speId: string) {
    setLoadingId(speId);
    const detail = await getSpeDetailAction(speId);
    setLoadingId(null);
    if (detail) setModal({ mode: "edit", spe: detail });
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
            <th>Situação</th>
            <th>Cidade/UF</th>
            {canEdit || canDelete ? <th aria-label="Ações" /> : null}
          </tr>
        </thead>
        <tbody>
          {spes.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ opacity: 0.7 }}>
                {search ? "Nenhuma SPE encontrada para essa busca." : "Nenhuma SPE cadastrada."}
              </td>
            </tr>
          ) : null}
          {spes.map((spe) => (
            <tr key={spe.id}>
              <td>{spe.name}</td>
              <td>{spe.document}</td>
              <td>{STATUS_LABELS[spe.status] ?? spe.status}</td>
              <td>{[spe.city, spe.state].filter(Boolean).join("/") || "—"}</td>
              {canEdit || canDelete ? (
                <td>
                  <div className="row-actions">
                    {canEdit ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Editar ${spe.name}`}
                        disabled={loadingId === spe.id}
                        onClick={() => openEdit(spe.id)}
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
          onCreated={(spe) => setModal({ mode: "edit", spe })}
          onOpenDuplicate={openEdit}
        />
      ) : null}
    </>
  );
}
