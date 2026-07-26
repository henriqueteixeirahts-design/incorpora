"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import { createBrokerAction, updateBrokerAction, deleteBrokerAction, type FormState } from "./actions";
import type { BrokerSortField } from "@/server/crm";

export type BrokerRow = {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  agencyId: string | null;
  agencyName: string | null;
};

export type AgencyOption = { id: string; name: string };

type ModalState = { mode: "create" } | { mode: "edit"; broker: BrokerRow } | null;

const initialState: FormState = {};

export function BrokersManager({
  brokers,
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
  brokers: BrokerRow[];
  agencies: AgencyOption[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  sortBy: BrokerSortField;
  sortDir: "asc" | "desc";
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function sortLink(field: BrokerSortField) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    const qs = new URLSearchParams();
    if (search) qs.set("bq", search);
    qs.set("bsort", field);
    qs.set("bdir", nextDir);
    return `/partners?${qs.toString()}#corretores`;
  }

  function pageLink(targetPage: number) {
    const qs = new URLSearchParams();
    if (search) qs.set("bq", search);
    qs.set("bsort", sortBy);
    qs.set("bdir", sortDir);
    qs.set("bpage", String(targetPage));
    return `/partners?${qs.toString()}#corretores`;
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Excluir o corretor "${name}"?`)) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteBrokerAction(id);
      if (result.error) setDeleteError(result.error);
    });
  }

  return (
    <div id="corretores">
      <div className="list-toolbar">
        <form className="list-search" action="/partners" method="get">
          <input type="hidden" name="bsort" value={sortBy} />
          <input type="hidden" name="bdir" value={sortDir} />
          <input type="search" name="bq" placeholder="Buscar por nome ou e-mail" defaultValue={search} />
          <button type="submit" className="secondary">
            Buscar
          </button>
        </form>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
            {total} corretor{total === 1 ? "" : "es"}
          </p>
          {canCreate ? (
            <button type="button" onClick={() => setModal({ mode: "create" })}>
              + Novo corretor
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
            <th>Imobiliária</th>
            <th>Contato</th>
            {canEdit || canDelete ? <th aria-label="Ações" /> : null}
          </tr>
        </thead>
        <tbody>
          {brokers.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ opacity: 0.7 }}>
                {search ? "Nenhum corretor encontrado." : "Nenhum corretor cadastrado."}
              </td>
            </tr>
          ) : null}
          {brokers.map((broker) => (
            <tr key={broker.id}>
              <td>{broker.name}</td>
              <td>{broker.agencyName ?? "Autônomo"}</td>
              <td>{[broker.email, broker.phone].filter(Boolean).join(" · ") || "—"}</td>
              {canEdit || canDelete ? (
                <td>
                  <div className="row-actions">
                    {canEdit ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Editar ${broker.name}`}
                        onClick={() => setModal({ mode: "edit", broker })}
                      >
                        <EditIcon />
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="icon-btn danger"
                        aria-label={`Excluir ${broker.name}`}
                        disabled={isPending}
                        onClick={() => handleDelete(broker.id, broker.name)}
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
        <BrokerModal
          mode={modal.mode}
          broker={modal.mode === "edit" ? modal.broker : null}
          agencies={agencies}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}

function BrokerModal({
  mode,
  broker,
  agencies,
  onClose,
}: {
  mode: "create" | "edit";
  broker: BrokerRow | null;
  agencies: AgencyOption[];
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const formAction = mode === "create" ? createBrokerAction : updateBrokerAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "edit" ? `Editar corretor — ${broker!.name}` : "Novo corretor"}
      width={520}
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
        {mode === "edit" && broker ? <input type="hidden" name="brokerId" value={broker.id} /> : null}
        <div className="field-section">
          <div className="field-grid">
            <div className="field">
              <label htmlFor="broker-name">Nome *</label>
              <input id="broker-name" name="name" required defaultValue={broker?.name ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="broker-agency">Imobiliária</label>
              <select id="broker-agency" name="agencyId" defaultValue={broker?.agencyId ?? ""}>
                <option value="">Autônomo</option>
                {agencies.map((agency) => (
                  <option key={agency.id} value={agency.id}>
                    {agency.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="broker-document">CPF/CNPJ</label>
              <input id="broker-document" name="document" defaultValue={broker?.document ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="broker-email">E-mail</label>
              <input id="broker-email" name="email" type="email" defaultValue={broker?.email ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="broker-phone">Telefone</label>
              <input id="broker-phone" name="phone" defaultValue={broker?.phone ?? ""} />
            </div>
          </div>
        </div>
        {state.error ? <p className="error-text">{state.error}</p> : null}
      </form>
    </Modal>
  );
}
