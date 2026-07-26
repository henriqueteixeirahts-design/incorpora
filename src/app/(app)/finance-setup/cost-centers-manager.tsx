"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import { createCostCenterAction, updateCostCenterAction, deleteCostCenterAction, type FormState } from "./actions";
import type { CostCenterSortField } from "@/server/finance-setup";

export type CostCenterRow = {
  id: string;
  name: string;
  developmentId: string | null;
  developmentName: string | null;
};

export type DevelopmentOption = { id: string; name: string };

type ModalState = { mode: "create" } | { mode: "edit"; costCenter: CostCenterRow } | null;

const initialState: FormState = {};

export function CostCentersManager({
  costCenters,
  developments,
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
  costCenters: CostCenterRow[];
  developments: DevelopmentOption[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  sortBy: CostCenterSortField;
  sortDir: "asc" | "desc";
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function sortLink(field: CostCenterSortField) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    const qs = new URLSearchParams();
    if (search) qs.set("cq", search);
    qs.set("csort", field);
    qs.set("cdir", nextDir);
    return `/finance-setup?${qs.toString()}#centros-de-custo`;
  }

  function pageLink(targetPage: number) {
    const qs = new URLSearchParams();
    if (search) qs.set("cq", search);
    qs.set("csort", sortBy);
    qs.set("cdir", sortDir);
    qs.set("cpage", String(targetPage));
    return `/finance-setup?${qs.toString()}#centros-de-custo`;
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Excluir o centro de custo "${name}"?`)) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteCostCenterAction(id);
      if (result.error) setDeleteError(result.error);
    });
  }

  return (
    <div id="centros-de-custo">
      <div className="list-toolbar">
        <form className="list-search" action="/finance-setup" method="get">
          <input type="hidden" name="csort" value={sortBy} />
          <input type="hidden" name="cdir" value={sortDir} />
          <input type="search" name="cq" placeholder="Buscar por nome" defaultValue={search} />
          <button type="submit" className="secondary">
            Buscar
          </button>
        </form>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
            {total} centro{total === 1 ? "" : "s"} de custo
          </p>
          {canCreate ? (
            <button type="button" onClick={() => setModal({ mode: "create" })}>
              + Novo centro de custo
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
            <th>Empreendimento</th>
            {canEdit || canDelete ? <th aria-label="Ações" /> : null}
          </tr>
        </thead>
        <tbody>
          {costCenters.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ opacity: 0.7 }}>
                {search ? "Nenhum centro de custo encontrado." : "Nenhum centro de custo cadastrado."}
              </td>
            </tr>
          ) : null}
          {costCenters.map((cc) => (
            <tr key={cc.id}>
              <td>{cc.name}</td>
              <td>{cc.developmentName ?? "Organização"}</td>
              {canEdit || canDelete ? (
                <td>
                  <div className="row-actions">
                    {canEdit ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Editar ${cc.name}`}
                        onClick={() => setModal({ mode: "edit", costCenter: cc })}
                      >
                        <EditIcon />
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="icon-btn danger"
                        aria-label={`Excluir ${cc.name}`}
                        disabled={isPending}
                        onClick={() => handleDelete(cc.id, cc.name)}
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
        <CostCenterModal
          mode={modal.mode}
          costCenter={modal.mode === "edit" ? modal.costCenter : null}
          developments={developments}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}

function CostCenterModal({
  mode,
  costCenter,
  developments,
  onClose,
}: {
  mode: "create" | "edit";
  costCenter: CostCenterRow | null;
  developments: DevelopmentOption[];
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const formAction = mode === "create" ? createCostCenterAction : updateCostCenterAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "edit" ? `Editar centro de custo — ${costCenter!.name}` : "Novo centro de custo"}
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
        {mode === "edit" && costCenter ? (
          <input type="hidden" name="costCenterId" value={costCenter.id} />
        ) : null}
        <div className="field-section">
          <div className="field-grid">
            <div className="field">
              <label htmlFor="cc-name">Nome *</label>
              <input id="cc-name" name="name" required defaultValue={costCenter?.name ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="cc-development">Empreendimento</label>
              <select id="cc-development" name="developmentId" defaultValue={costCenter?.developmentId ?? ""}>
                <option value="">Organização (sem empreendimento específico)</option>
                {developments.map((dev) => (
                  <option key={dev.id} value={dev.id}>
                    {dev.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {state.error ? <p className="error-text">{state.error}</p> : null}
      </form>
    </Modal>
  );
}
