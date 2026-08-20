"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import { formatDocument, formatPhone } from "@/lib/br-validation";
import { deletePermutanteAction, getPermutanteDetailAction } from "./actions";
import { PermutanteModal } from "./permutante-modal";
import type { Permutante } from "@/generated/prisma/client";
import type { PermutanteSortField } from "@/server/permutantes";

export type PermutanteRow = {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  document: string;
  email: string | null;
  phone: string | null;
};

type ModalState = { mode: "create" } | { mode: "edit"; permutante: Permutante } | null;

const SORTABLE_COLUMNS: { field: PermutanteSortField; label: string }[] = [
  { field: "name", label: "Nome" },
  { field: "type", label: "Tipo" },
  { field: "document", label: "Documento" },
];

export function PermutantesManager({
  permutantes,
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
  permutantes: PermutanteRow[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  sortBy: PermutanteSortField;
  sortDir: "asc" | "desc";
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function sortLink(field: PermutanteSortField) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("sort", field);
    qs.set("dir", nextDir);
    return `/permutantes?${qs.toString()}`;
  }

  function pageLink(targetPage: number) {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("sort", sortBy);
    qs.set("dir", sortDir);
    qs.set("page", String(targetPage));
    return `/permutantes?${qs.toString()}`;
  }

  async function openEdit(permutanteId: string) {
    setLoadingId(permutanteId);
    const detail = await getPermutanteDetailAction(permutanteId);
    setLoadingId(null);
    if (detail) setModal({ mode: "edit", permutante: detail });
  }

  function handleDelete(permutanteId: string, name: string) {
    if (!confirm(`Excluir o permutante "${name}"? Essa ação não pode ser desfeita.`)) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deletePermutanteAction(permutanteId);
      if (result.error) setDeleteError(result.error);
    });
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
        <form className="inc-search" style={{ width: 320 }} action="/permutantes" method="get">
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="search" name="q" placeholder="Buscar por nome ou documento" defaultValue={search} />
        </form>

        <span style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
          {total} permutante{total === 1 ? "" : "s"}
        </span>

        {canCreate ? (
          <button
            type="button"
            className="inc-btn inc-btn--primary"
            style={{ marginLeft: "auto" }}
            onClick={() => setModal({ mode: "create" })}
          >
            + Novo permutante
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
                  <Link
                    href={sortLink(col.field)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "inherit", textDecoration: "none" }}
                  >
                    {col.label}
                    <SortIcon direction={sortBy === col.field ? sortDir : null} />
                  </Link>
                </th>
              ))}
              <th>Contato</th>
              {canEdit || canDelete ? <th aria-label="Ações" /> : null}
            </tr>
          </thead>
          <tbody>
            {permutantes.length === 0 ? (
              <tr>
                <td colSpan={5} className="is-empty">
                  {search ? "Nenhum permutante encontrado para essa busca." : "Nenhum permutante cadastrado."}
                </td>
              </tr>
            ) : null}
            {permutantes.map((permutante) => (
              <tr key={permutante.id}>
                <td className="is-key">{permutante.name}</td>
                <td className="is-muted">{permutante.typeLabel}</td>
                <td>{formatDocument(permutante.document, permutante.type as "INDIVIDUAL" | "COMPANY")}</td>
                <td className="is-muted">
                  {[permutante.email, permutante.phone ? formatPhone(permutante.phone) : null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </td>
                {canEdit || canDelete ? (
                  <td>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      {canEdit ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
                          aria-label={`Editar ${permutante.name}`}
                          disabled={loadingId === permutante.id}
                          onClick={() => openEdit(permutante.id)}
                        >
                          <EditIcon />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
                          aria-label={`Excluir ${permutante.name}`}
                          disabled={isPending}
                          onClick={() => handleDelete(permutante.id, permutante.name)}
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
        <PermutanteModal
          mode={modal.mode}
          permutante={modal.mode === "edit" ? modal.permutante : null}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
          onOpenDuplicate={openEdit}
        />
      ) : null}
    </>
  );
}
