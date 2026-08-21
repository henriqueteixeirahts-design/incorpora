"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import { AddressFields } from "@/components/AddressFields";
import { formatDocument, isValidDocument } from "@/lib/br-validation";
import { createBrokerAction, updateBrokerAction, deleteBrokerAction, type FormState } from "./actions";
import type { BrokerSortField } from "@/server/crm";
import { formatDateTimeBR } from "@/lib/format";

export type BrokerRow = {
  id: string;
  name: string;
  document: string | null;
  creci: string | null;
  email: string | null;
  phone: string | null;
  role: "BROKER" | "MANAGER";
  agencyId: string | null;
  agencyName: string | null;
  managerId: string | null;
  managerName: string | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  billingType: "INDIVIDUAL" | "COMPANY" | null;
  billingDocument: string | null;
  billingName: string | null;
  billingBankName: string | null;
  billingBankAgency: string | null;
  billingBankAccount: string | null;
  billingPixKey: string | null;
  audit: { createdByName: string | null; createdAt: Date; updatedByName: string | null; updatedAt: Date };
};

export type AgencyOption = { id: string; name: string };
export type ManagerOption = { id: string; name: string };

type ModalState = { mode: "create" } | { mode: "edit"; broker: BrokerRow } | null;

const initialState: FormState = {};

export function BrokersManager({
  brokers,
  agencies,
  managers,
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
  managers: ManagerOption[];
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
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
        <form className="inc-search" style={{ width: 320 }} action="/partners" method="get">
          <input type="hidden" name="bsort" value={sortBy} />
          <input type="hidden" name="bdir" value={sortDir} />
          <input type="search" name="bq" placeholder="Buscar por nome ou e-mail" defaultValue={search} />
        </form>

        <span style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
          {total} corretor{total === 1 ? "" : "es"}
        </span>

        {canCreate ? (
          <button type="button" className="inc-btn inc-btn--primary" style={{ marginLeft: "auto" }} onClick={() => setModal({ mode: "create" })}>
            + Novo corretor
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
              <th>Tipo</th>
              <th>Imobiliária</th>
              <th>Gerente direto</th>
              <th>Contato</th>
              {canEdit || canDelete ? <th aria-label="Ações" /> : null}
            </tr>
          </thead>
          <tbody>
            {brokers.length === 0 ? (
              <tr>
                <td colSpan={6} className="is-empty">
                  {search ? "Nenhum corretor encontrado." : "Nenhum corretor cadastrado."}
                </td>
              </tr>
            ) : null}
            {brokers.map((broker) => (
              <tr key={broker.id}>
                <td className="is-key">
                  {broker.name}
                  {broker.role === "MANAGER" ? (
                    <span className="inc-pill inc-pill--info" style={{ marginLeft: "8px" }}>Gerente</span>
                  ) : null}
                </td>
                <td className="is-muted">{broker.agencyId ? "Vinculado" : "Autônomo"}</td>
                <td className="is-muted">{broker.agencyName ?? "—"}</td>
                <td className="is-muted">{broker.managerName ?? "—"}</td>
                <td className="is-muted">{[broker.email, broker.phone].filter(Boolean).join(" · ") || "—"}</td>
                {canEdit || canDelete ? (
                  <td>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      {canEdit ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
                          aria-label={`Editar ${broker.name}`}
                          onClick={() => setModal({ mode: "edit", broker })}
                        >
                          <EditIcon />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
                          aria-label={`Excluir ${broker.name}`}
                          disabled={isPending}
                          onClick={() => handleDelete(broker.id, broker.name)}
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
        <BrokerModal
          mode={modal.mode}
          broker={modal.mode === "edit" ? modal.broker : null}
          agencies={agencies}
          managers={managers}
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
  managers,
  onClose,
}: {
  mode: "create" | "edit";
  broker: BrokerRow | null;
  agencies: AgencyOption[];
  managers: ManagerOption[];
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const formAction = mode === "create" ? createBrokerAction : updateBrokerAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [billingType, setBillingType] = useState<"INDIVIDUAL" | "COMPANY">(broker?.billingType ?? "INDIVIDUAL");
  const [billingDocumentError, setBillingDocumentError] = useState<string | null>(null);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  // Um corretor não pode ser gerente de si mesmo — filtra da lista quando editando.
  const managerOptions = managers.filter((m) => m.id !== broker?.id);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "edit" ? `Editar corretor — ${broker!.name}` : "Novo corretor"}
      width={680}
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
        {mode === "edit" && broker ? <input type="hidden" name="brokerId" value={broker.id} /> : null}
        {mode === "edit" && broker ? (
          <p style={{ marginTop: 0, marginBottom: "12px", fontSize: "12px", color: "var(--inc-text-soft)" }}>
            Cadastrado por {broker.audit.createdByName ?? "—"} em {formatDateTimeBR(broker.audit.createdAt)}
            {" · "}Última alteração por {broker.audit.updatedByName ?? "—"} em{" "}
            {formatDateTimeBR(broker.audit.updatedAt)}
          </p>
        ) : null}
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Identificação (pessoa física)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px", marginBottom: "14px" }}>
          <label className="inc-field">
            <span className="inc-label">Nome *</span>
            <input id="broker-name" name="name" className="inc-input" required defaultValue={broker?.name ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">CPF</span>
            <input
              id="broker-document"
              name="document"
              className={`inc-input${documentError ? " inc-input--invalid" : ""}`}
              defaultValue={broker?.document ? formatDocument(broker.document, "INDIVIDUAL") : ""}
              onBlur={(e) => {
                const formatted = formatDocument(e.target.value, "INDIVIDUAL");
                e.target.value = formatted;
                setDocumentError(formatted.trim() && !isValidDocument(formatted, "INDIVIDUAL") ? "CPF inválido." : null);
              }}
            />
            {documentError ? <span className="inc-help inc-help--error">{documentError}</span> : null}
          </label>
          <label className="inc-field">
            <span className="inc-label">CRECI</span>
            <input id="broker-creci" name="creci" className="inc-input" defaultValue={broker?.creci ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Papel</span>
            <select id="broker-role" name="role" className="inc-select" defaultValue={broker?.role ?? "BROKER"}>
              <option value="BROKER">Corretor</option>
              <option value="MANAGER">Gerente</option>
            </select>
          </label>
          <label className="inc-field">
            <span className="inc-label">Imobiliária</span>
            <select id="broker-agency" name="agencyId" className="inc-select" defaultValue={broker?.agencyId ?? ""}>
              <option value="">Autônomo</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>{agency.name}</option>
              ))}
            </select>
          </label>
          <label className="inc-field">
            <span className="inc-label">Gerente direto</span>
            <select id="broker-manager" name="managerId" className="inc-select" defaultValue={broker?.managerId ?? ""}>
              <option value="">Nenhum</option>
              {managerOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Contato</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px", marginBottom: "18px" }}>
          <label className="inc-field">
            <span className="inc-label">E-mail</span>
            <input id="broker-email" name="email" type="email" className="inc-input" defaultValue={broker?.email ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Telefone</span>
            <input id="broker-phone" name="phone" className="inc-input" defaultValue={broker?.phone ?? ""} />
          </label>
        </div>

        <div style={{ marginBottom: "18px" }}>
          <AddressFields idPrefix="broker-" defaultValues={broker ?? undefined} />
        </div>

        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>
          Faturamento (docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 1.1)
        </div>
        <p style={{ fontSize: "12px", color: "var(--inc-text-soft)", marginTop: 0, marginBottom: "10px" }}>
          O pagamento pode sair no próprio CPF do corretor ou numa PJ que ele indique (dele ou de terceiro).
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px", marginBottom: "14px" }}>
          <label className="inc-field">
            <span className="inc-label">Tipo de recebimento</span>
            <select
              id="broker-billing-type"
              name="billingType"
              className="inc-select"
              value={billingType}
              onChange={(e) => setBillingType(e.target.value as "INDIVIDUAL" | "COMPANY")}
            >
              <option value="INDIVIDUAL">Pessoa física (CPF do corretor)</option>
              <option value="COMPANY">Pessoa jurídica (PJ própria ou de terceiro)</option>
            </select>
          </label>
          {billingType === "COMPANY" ? (
            <>
              <label className="inc-field">
                <span className="inc-label">Razão social</span>
                <input id="broker-billing-name" name="billingName" className="inc-input" defaultValue={broker?.billingName ?? ""} />
              </label>
              <label className="inc-field">
                <span className="inc-label">CNPJ</span>
                <input
                  id="broker-billing-document"
                  name="billingDocument"
                  className={`inc-input${billingDocumentError ? " inc-input--invalid" : ""}`}
                  defaultValue={broker?.billingDocument ? formatDocument(broker.billingDocument, "COMPANY") : ""}
                  onBlur={(e) => {
                    const formatted = formatDocument(e.target.value, "COMPANY");
                    e.target.value = formatted;
                    setBillingDocumentError(formatted.trim() && !isValidDocument(formatted, "COMPANY") ? "CNPJ inválido." : null);
                  }}
                />
                {billingDocumentError ? <span className="inc-help inc-help--error">{billingDocumentError}</span> : null}
              </label>
            </>
          ) : null}
        </div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Dados bancários / Pix</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
          <label className="inc-field">
            <span className="inc-label">Banco</span>
            <input id="broker-bank-name" name="billingBankName" className="inc-input" defaultValue={broker?.billingBankName ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Agência</span>
            <input id="broker-bank-agency" name="billingBankAgency" className="inc-input" defaultValue={broker?.billingBankAgency ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Conta</span>
            <input id="broker-bank-account" name="billingBankAccount" className="inc-input" defaultValue={broker?.billingBankAccount ?? ""} />
          </label>
          <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
            <span className="inc-label">Chave Pix</span>
            <input id="broker-pix-key" name="billingPixKey" className="inc-input" defaultValue={broker?.billingPixKey ?? ""} />
          </label>
        </div>

        {state.error ? <p className="error-text" style={{ marginTop: "14px" }}>{state.error}</p> : null}
      </form>
    </Modal>
  );
}
