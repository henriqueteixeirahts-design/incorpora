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

const STATUS_CHIP_CLASSES: Record<string, string> = {
  ACTIVE: "inc-chip--contrato",
  IN_FORMATION: "inc-chip--reserva",
  CLOSED: "inc-chip--permuta",
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
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
        <form className="inc-search" style={{ width: 320 }} action="/spes" method="get">
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="search" name="q" placeholder="Buscar por nome ou CNPJ" defaultValue={search} />
        </form>

        <span style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
          {total} SPE{total === 1 ? "" : "s"}
        </span>

        {canCreate ? (
          <button type="button" className="inc-btn inc-btn--primary" style={{ marginLeft: "auto" }} onClick={() => setModal({ mode: "create" })}>
            + Nova SPE
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
              <th>Situação</th>
              <th>Cidade/UF</th>
              {canEdit || canDelete ? <th aria-label="Ações" /> : null}
            </tr>
          </thead>
          <tbody>
            {spes.length === 0 ? (
              <tr>
                <td colSpan={5} className="is-empty">
                  {search ? "Nenhuma SPE encontrada para essa busca." : "Nenhuma SPE cadastrada."}
                </td>
              </tr>
            ) : null}
            {spes.map((spe) => (
              <tr key={spe.id}>
                <td className="is-key">{spe.name}</td>
                <td className="is-muted">{spe.document}</td>
                <td>
                  <span className={`inc-chip ${STATUS_CHIP_CLASSES[spe.status] ?? "inc-chip--investidor"}`}>
                    {STATUS_LABELS[spe.status] ?? spe.status}
                  </span>
                </td>
                <td className="is-muted">{[spe.city, spe.state].filter(Boolean).join("/") || "—"}</td>
                {canEdit || canDelete ? (
                  <td>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      {canEdit ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
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
                          className="inc-btn-icon"
                          aria-label={`Excluir ${spe.name}`}
                          disabled={isPending}
                          onClick={() => handleDelete(spe.id, spe.name)}
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
