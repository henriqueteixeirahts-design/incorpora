"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import { createCostCenterAction, updateCostCenterAction, deleteCostCenterAction, type FormState } from "./actions";
import type { CostCenterSortField } from "@/server/finance-setup";
import { formatDateTimeBR } from "@/lib/format";

export type CostCenterRow = {
  id: string;
  name: string;
  developmentId: string | null;
  developmentName: string | null;
  audit: { createdByName: string | null; createdAt: Date; updatedByName: string | null; updatedAt: Date };
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
    return `/settings/finance-setup?${qs.toString()}#centros-de-custo`;
  }

  function pageLink(targetPage: number) {
    const qs = new URLSearchParams();
    if (search) qs.set("cq", search);
    qs.set("csort", sortBy);
    qs.set("cdir", sortDir);
    qs.set("cpage", String(targetPage));
    return `/settings/finance-setup?${qs.toString()}#centros-de-custo`;
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
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
        <form className="inc-search" style={{ width: 320 }} action="/settings/finance-setup" method="get">
          <input type="hidden" name="csort" value={sortBy} />
          <input type="hidden" name="cdir" value={sortDir} />
          <input type="search" name="cq" placeholder="Buscar por nome" defaultValue={search} />
        </form>

        <span style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
          {total} centro{total === 1 ? "" : "s"} de custo
        </span>

        {canCreate ? (
          <button
            type="button"
            className="inc-btn inc-btn--primary"
            style={{ marginLeft: "auto" }}
            onClick={() => setModal({ mode: "create" })}
          >
            + Novo centro de custo
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
              <th>Empreendimento</th>
              {canEdit || canDelete ? <th aria-label="Ações" /> : null}
            </tr>
          </thead>
          <tbody>
            {costCenters.length === 0 ? (
              <tr>
                <td colSpan={3} className="is-empty">
                  {search ? "Nenhum centro de custo encontrado." : "Nenhum centro de custo cadastrado."}
                </td>
              </tr>
            ) : null}
            {costCenters.map((cc) => (
              <tr key={cc.id}>
                <td className="is-key">{cc.name}</td>
                <td className="is-muted">{cc.developmentName ?? "Organização"}</td>
                {canEdit || canDelete ? (
                  <td>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      {canEdit ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
                          aria-label={`Editar ${cc.name}`}
                          onClick={() => setModal({ mode: "edit", costCenter: cc })}
                        >
                          <EditIcon />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
                          aria-label={`Excluir ${cc.name}`}
                          disabled={isPending}
                          onClick={() => handleDelete(cc.id, cc.name)}
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
        {mode === "edit" && costCenter ? (
          <input type="hidden" name="costCenterId" value={costCenter.id} />
        ) : null}
        {mode === "edit" && costCenter ? (
          <p style={{ marginTop: 0, marginBottom: "12px", fontSize: "12px", color: "var(--inc-text-soft)" }}>
            Cadastrado por {costCenter.audit.createdByName ?? "—"} em {formatDateTimeBR(costCenter.audit.createdAt)}
            {" · "}Última alteração por {costCenter.audit.updatedByName ?? "—"} em{" "}
            {formatDateTimeBR(costCenter.audit.updatedAt)}
          </p>
        ) : null}
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Identificação</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
          <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
            <span className="inc-label">Nome *</span>
            <input id="cc-name" name="name" className="inc-input" required defaultValue={costCenter?.name ?? ""} />
          </label>
          <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
            <span className="inc-label">Empreendimento</span>
            <select id="cc-development" name="developmentId" className="inc-select" defaultValue={costCenter?.developmentId ?? ""}>
              <option value="">Organização (sem empreendimento específico)</option>
              {developments.map((dev) => (
                <option key={dev.id} value={dev.id}>
                  {dev.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {state.error ? <p className="error-text" style={{ marginTop: "14px" }}>{state.error}</p> : null}
      </form>
    </Modal>
  );
}
