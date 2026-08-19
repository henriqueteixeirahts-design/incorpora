"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import { createAgencyAction, updateAgencyAction, deleteAgencyAction, type FormState } from "./actions";
import type { AgencySortField } from "@/server/crm";
import { formatDateTimeBR } from "@/lib/format";

export type AgencyRow = {
  id: string;
  name: string;
  document: string | null;
  audit: { createdByName: string | null; createdAt: Date; updatedByName: string | null; updatedAt: Date };
};

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
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
        <form className="inc-search" style={{ width: 320 }} action="/partners" method="get">
          <input type="hidden" name="asort" value={sortBy} />
          <input type="hidden" name="adir" value={sortDir} />
          <input type="search" name="aq" placeholder="Buscar por nome" defaultValue={search} />
        </form>

        <span style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
          {total} imobiliária{total === 1 ? "" : "s"}
        </span>

        {canCreate ? (
          <button type="button" className="inc-btn inc-btn--primary" style={{ marginLeft: "auto" }} onClick={() => setModal({ mode: "create" })}>
            + Nova imobiliária
          </button>
        ) : null}
      </div>

      {deleteError ? <p className="error-text" style={{ marginBottom: "12px" }}>{deleteError}</p> : null}

      <div className="inc-card">
        <table className="inc-table" style={{ border: 0 }}>
          <thead>
            <tr>
              <th>
                <Link href={sortLink("name")} style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "inherit", textDecoration: "none" }}>
                  Nome
                  <SortIcon direction={sortBy === "name" ? sortDir : null} />
                </Link>
              </th>
              <th>CNPJ</th>
              {canEdit || canDelete ? <th aria-label="Ações" /> : null}
            </tr>
          </thead>
          <tbody>
            {agencies.length === 0 ? (
              <tr>
                <td colSpan={3} className="is-empty">
                  {search ? "Nenhuma imobiliária encontrada." : "Nenhuma imobiliária cadastrada."}
                </td>
              </tr>
            ) : null}
            {agencies.map((agency) => (
              <tr key={agency.id}>
                <td className="is-key">{agency.name}</td>
                <td className="is-muted">{agency.document ?? "—"}</td>
                {canEdit || canDelete ? (
                  <td>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      {canEdit ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
                          aria-label={`Editar ${agency.name}`}
                          onClick={() => setModal({ mode: "edit", agency })}
                        >
                          <EditIcon />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
                          aria-label={`Excluir ${agency.name}`}
                          disabled={isPending}
                          onClick={() => handleDelete(agency.id, agency.name)}
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
        {mode === "edit" && agency ? <input type="hidden" name="agencyId" value={agency.id} /> : null}
        {mode === "edit" && agency ? (
          <p style={{ marginTop: 0, marginBottom: "12px", fontSize: "12px", color: "var(--inc-text-soft)" }}>
            Cadastrado por {agency.audit.createdByName ?? "—"} em {formatDateTimeBR(agency.audit.createdAt)}
            {" · "}Última alteração por {agency.audit.updatedByName ?? "—"} em{" "}
            {formatDateTimeBR(agency.audit.updatedAt)}
          </p>
        ) : null}
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Identificação</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
          <label className="inc-field">
            <span className="inc-label">Nome *</span>
            <input id="agency-name" name="name" className="inc-input" required defaultValue={agency?.name ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">CNPJ</span>
            <input id="agency-document" name="document" className="inc-input" defaultValue={agency?.document ?? ""} />
          </label>
        </div>
        {state.error ? <p className="error-text" style={{ marginTop: "14px" }}>{state.error}</p> : null}
      </form>
    </Modal>
  );
}
