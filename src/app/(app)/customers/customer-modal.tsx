"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Tabs, type TabDef } from "@/components/Tabs";
import { TrashIcon, DownloadIcon } from "@/components/icons";
import { AddressFields } from "@/components/AddressFields";
import { formatDocument, formatPhone, isValidDocument, isValidEmail } from "@/lib/br-validation";
import { formatDateBR, formatDateTimeBR } from "@/lib/format";
import {
  createCustomerAction,
  updateCustomerAction,
  getCustomerDetailAction,
  createCustomerContactAction,
  deleteCustomerContactAction,
  uploadCustomerDocumentAction,
  deleteCustomerDocumentAction,
  type FormState,
} from "./actions";

export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof getCustomerDetailAction>>>;

const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  PLAN: "Planta",
  MEMORIAL: "Memorial descritivo",
  REGISTRATION: "Matrícula",
  CONTRACT: "Contrato",
  PROOF: "Comprovante",
  REPORT: "Relatório",
  OTHER: "Outro",
};

const initialState: FormState = {};

export function CustomerModal({
  mode,
  customer,
  onClose,
  onCreated,
  onOpenDuplicate,
}: {
  mode: "create" | "edit";
  customer: CustomerDetail | null;
  onClose: () => void;
  onCreated: (customer: CustomerDetail) => void;
  onOpenDuplicate: (customerId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState("dados");
  const [documentType, setDocumentType] = useState<"INDIVIDUAL" | "COMPANY">(
    customer?.type ?? "INDIVIDUAL",
  );
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const formAction = mode === "create" ? createCustomerAction : updateCustomerAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);
  const dadosFormRef = useRef<HTMLFormElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.success || !state.customerId) return;
    getCustomerDetailAction(state.customerId).then((detail) => {
      if (detail) onCreated(detail);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success, state.customerId]);

  const isEditing = mode === "edit" && !!customer;
  const dependentTabsDisabled = !isEditing;
  const hasLegacyAddress =
    !!customer?.address && !customer.street && !customer.city && !customer.zipCode;

  const tabs: TabDef[] = [
    { id: "dados", label: "Dados" },
    {
      id: "contatos",
      label: "Contatos",
      disabled: dependentTabsDisabled,
      disabledHint: "Salve o cliente primeiro.",
    },
    { id: "atendimento", label: "Atendimento" },
    {
      id: "anexos",
      label: "Anexos",
      disabled: dependentTabsDisabled,
      disabledHint: "Salve o cliente primeiro.",
    },
    { id: "acessos", label: "Acessos" },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? `Editar cliente — ${customer!.name}` : "Novo cliente"}
      footer={
        <>
          <button type="button" className="inc-btn inc-btn--secondary" onClick={onClose}>
            Fechar
          </button>
          <button
            type="button"
            className="inc-btn inc-btn--primary"
            disabled={pending}
            onClick={() => dadosFormRef.current?.requestSubmit()}
          >
            {pending ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      {isEditing && customer!.audit ? (
        <p style={{ marginTop: 0, marginBottom: "12px", fontSize: "12px", color: "var(--inc-text-soft)" }}>
          Cadastrado por {customer!.audit.createdByName ?? "—"} em{" "}
          {formatDateTimeBR(customer!.audit.createdAt)}
          {customer!.audit.updatedAt !== customer!.audit.createdAt ? (
            <>
              {" "}
              · Última alteração por {customer!.audit.updatedByName ?? "—"} em{" "}
              {formatDateTimeBR(customer!.audit.updatedAt)}
            </>
          ) : null}
        </p>
      ) : null}

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div hidden={activeTab !== "dados"}>
        <form id="customer-dados-form" ref={dadosFormRef} action={dispatch}>
          {mode === "edit" && customer ? (
            <input type="hidden" name="customerId" value={customer.id} />
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div>
              <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Identificação</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                <label className="inc-field">
                  <span className="inc-label">Tipo *</span>
                  <select
                    id="type"
                    name="type"
                    className="inc-select"
                    defaultValue={customer?.type ?? "INDIVIDUAL"}
                    onChange={(e) => {
                      const next = e.target.value as "INDIVIDUAL" | "COMPANY";
                      setDocumentType(next);
                      setDocumentError(null);
                      if (documentInputRef.current) {
                        documentInputRef.current.value = formatDocument(documentInputRef.current.value, next);
                      }
                    }}
                  >
                    <option value="INDIVIDUAL">Pessoa física</option>
                    <option value="COMPANY">Pessoa jurídica</option>
                  </select>
                </label>
                <label className="inc-field">
                  <span className="inc-label">Nome *</span>
                  <input id="name" name="name" className="inc-input" required defaultValue={customer?.name ?? ""} />
                </label>
                <label className="inc-field">
                  <span className="inc-label">{documentType === "COMPANY" ? "CNPJ *" : "CPF *"}</span>
                  <input
                    id="document"
                    name="document"
                    ref={documentInputRef}
                    required
                    className={`inc-input${documentError ? " inc-input--invalid" : ""}`}
                    placeholder={documentType === "COMPANY" ? "00.000.000/0000-00" : "000.000.000-00"}
                    defaultValue={customer ? formatDocument(customer.document, customer.type) : ""}
                    onChange={() => setDocumentError(null)}
                    onBlur={(e) => {
                      const formatted = formatDocument(e.target.value, documentType);
                      e.target.value = formatted;
                      if (formatted.trim() && !isValidDocument(formatted, documentType)) {
                        setDocumentError(documentType === "COMPANY" ? "CNPJ inválido." : "CPF inválido.");
                      } else {
                        setDocumentError(null);
                      }
                    }}
                  />
                  {documentError ? <span className="inc-help inc-help--error">{documentError}</span> : null}
                </label>
              </div>
            </div>

            {documentType === "INDIVIDUAL" ? (
              <div>
                <div className="inc-eyebrow" style={{ marginBottom: "4px" }}>Qualificação civil</div>
                <p style={{ fontSize: "12px", color: "var(--inc-text-soft)", marginBottom: "8px" }}>
                  Usado pelo motor de templates de documento (qualificação das partes no contrato).
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                  <label className="inc-field">
                    <span className="inc-label">Estado civil</span>
                    <input id="maritalStatus" name="maritalStatus" className="inc-input" defaultValue={customer?.maritalStatus ?? ""} />
                  </label>
                  <label className="inc-field">
                    <span className="inc-label">Nacionalidade</span>
                    <input id="nationality" name="nationality" className="inc-input" defaultValue={customer?.nationality ?? ""} />
                  </label>
                  <label className="inc-field">
                    <span className="inc-label">Profissão</span>
                    <input id="profession" name="profession" className="inc-input" defaultValue={customer?.profession ?? ""} />
                  </label>
                </div>
              </div>
            ) : null}

            <div>
              <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Contato</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <label className="inc-field">
                  <span className="inc-label">E-mail *</span>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className={`inc-input${emailError ? " inc-input--invalid" : ""}`}
                    defaultValue={customer?.email ?? ""}
                    onChange={() => setEmailError(null)}
                    onBlur={(e) => {
                      if (e.target.value.trim() && !isValidEmail(e.target.value)) {
                        setEmailError("E-mail inválido.");
                      } else {
                        setEmailError(null);
                      }
                    }}
                  />
                  {emailError ? <span className="inc-help inc-help--error">{emailError}</span> : null}
                </label>
                <label className="inc-field">
                  <span className="inc-label">Telefone *</span>
                  <input
                    id="phone"
                    name="phone"
                    ref={phoneInputRef}
                    required
                    className="inc-input"
                    placeholder="(00) 00000-0000"
                    defaultValue={customer?.phone ? formatPhone(customer.phone) : ""}
                    onBlur={(e) => {
                      e.target.value = formatPhone(e.target.value);
                    }}
                  />
                </label>
              </div>
            </div>

            <AddressFields
              defaultValues={customer ?? undefined}
              legacyNote={hasLegacyAddress ? `Endereço legado (cadastro anterior): ${customer!.address}` : null}
              numberRequired
            />

            <div>
              <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Observações</div>
              <label className="inc-field">
                <textarea
                  id="notes"
                  name="notes"
                  className="inc-input"
                  rows={3}
                  defaultValue={customer?.notes ?? ""}
                />
              </label>
            </div>

            {state.error ? (
              <p className="error-text">
                {state.error}
                {state.duplicateCustomerId ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="inc-btn inc-btn--secondary inc-btn--sm"
                      onClick={() => onOpenDuplicate(state.duplicateCustomerId!)}
                    >
                      Abrir cadastro existente
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </form>
      </div>

      <div hidden={activeTab !== "contatos"}>
        {isEditing ? <ContactsTab customer={customer!} onUpdated={onCreated} /> : null}
      </div>

      <div hidden={activeTab !== "atendimento"}>
        <p className="field-hint">
          Em breve: histórico de atendimento (contatos realizados, corretor responsável,
          preferências do cliente).
        </p>
      </div>

      <div hidden={activeTab !== "anexos"}>
        {isEditing ? <DocumentsTab customer={customer!} onUpdated={onCreated} /> : null}
      </div>

      <div hidden={activeTab !== "acessos"}>
        <p className="field-hint">
          Reservado para o Portal do Cliente (Fase 2): controle de quais contatos deste
          cliente terão acesso a documentos, boletos e andamento da unidade. A lógica de
          permissão ainda não está ativa.
        </p>
      </div>
    </Modal>
  );
}

function ContactsTab({
  customer,
  onUpdated,
}: {
  customer: CustomerDetail;
  onUpdated: (customer: CustomerDetail) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const detail = await getCustomerDetailAction(customer.id);
    if (detail) onUpdated(detail);
  }

  async function handleAdd() {
    setError(null);
    if (!name.trim()) {
      setError("Nome do contato é obrigatório.");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError("Informe pelo menos um e-mail ou telefone para o contato.");
      return;
    }
    setBusy(true);
    const result = await createCustomerContactAction(customer.id, {
      name,
      role: role || undefined,
      email: email || undefined,
      phone: phone || undefined,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setName("");
    setRole("");
    setEmail("");
    setPhone("");
    await refresh();
  }

  async function handleDelete(contactId: string) {
    if (!confirm("Remover este contato?")) return;
    setBusy(true);
    await deleteCustomerContactAction(contactId);
    setBusy(false);
    await refresh();
  }

  return (
    <div>
      {customer.contacts.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--inc-text-soft)" }}>Nenhum contato adicional cadastrado.</p>
      ) : (
        <table className="inc-table" style={{ marginBottom: "16px" }}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Cargo/Relação</th>
              <th>E-mail</th>
              <th>Telefone</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {customer.contacts.map((contact) => (
              <tr key={contact.id}>
                <td className="is-key">{contact.name}</td>
                <td className="is-muted">{contact.role || "—"}</td>
                <td>{contact.email || "—"}</td>
                <td>{contact.phone ? formatPhone(contact.phone) : "—"}</td>
                <td>
                  <button
                    type="button"
                    className="inc-btn-icon"
                    aria-label={`Remover ${contact.name}`}
                    disabled={busy}
                    onClick={() => handleDelete(contact.id)}
                    style={{ color: "var(--inc-danger)" }}
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "4px" }}>Adicionar contato</div>
        <p style={{ fontSize: "12px", color: "var(--inc-text-soft)", marginTop: 0, marginBottom: "10px" }}>
          Informe nome e pelo menos um e-mail ou telefone.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "14px" }}>
          <label className="inc-field">
            <span className="inc-label">Nome *</span>
            <input className="inc-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Cargo/Relação</span>
            <input className="inc-input" value={role} onChange={(e) => setRole(e.target.value)} />
          </label>
          <label className="inc-field">
            <span className="inc-label">E-mail</span>
            <input className="inc-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Telefone</span>
            <input
              className="inc-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={(e) => setPhone(formatPhone(e.target.value))}
            />
          </label>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <button
          type="button"
          className="inc-btn inc-btn--secondary"
          style={{ marginTop: "12px" }}
          disabled={busy}
          onClick={handleAdd}
        >
          + Adicionar contato
        </button>
      </div>
    </div>
  );
}

function DocumentsTab({
  customer,
  onUpdated,
}: {
  customer: CustomerDetail;
  onUpdated: (customer: CustomerDetail) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("OTHER");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const detail = await getCustomerDetailAction(customer.id);
    if (detail) onUpdated(detail);
  }

  async function handleUpload() {
    setError(null);
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Selecione um arquivo.");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    formData.set("category", category);

    setBusy(true);
    const result = await uploadCustomerDocumentAction(customer.id, formData);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    await refresh();
  }

  async function handleDelete(documentId: string) {
    if (!confirm("Remover este anexo?")) return;
    setBusy(true);
    await deleteCustomerDocumentAction(documentId);
    setBusy(false);
    await refresh();
  }

  return (
    <div>
      {customer.documents.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--inc-text-soft)" }}>Nenhum anexo enviado.</p>
      ) : (
        <table className="inc-table" style={{ marginBottom: "16px" }}>
          <thead>
            <tr>
              <th>Arquivo</th>
              <th>Categoria</th>
              <th>Enviado</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {customer.documents.map((doc) => (
              <tr key={doc.id}>
                <td className="is-key">{doc.fileName}</td>
                <td>{DOCUMENT_CATEGORY_LABELS[doc.category] ?? doc.category}</td>
                <td className="is-muted">
                  {formatDateBR(doc.createdAt)}
                  <div className="inc-table__sub">por {doc.uploadedByName ?? "—"}</div>
                </td>
                <td>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    {doc.signedUrl ? (
                      <a
                        className="inc-btn-icon"
                        href={doc.signedUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Baixar ${doc.fileName}`}
                      >
                        <DownloadIcon />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="inc-btn-icon"
                      aria-label={`Remover ${doc.fileName}`}
                      disabled={busy}
                      onClick={() => handleDelete(doc.id)}
                      style={{ color: "var(--inc-danger)" }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Enviar anexo</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <label className="inc-field">
            <span className="inc-label">Categoria</span>
            <select className="inc-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="inc-field">
            <span className="inc-label">Arquivo</span>
            <input className="inc-input" ref={fileInputRef} type="file" />
          </label>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <button
          type="button"
          className="inc-btn inc-btn--secondary"
          style={{ marginTop: "12px" }}
          disabled={busy}
          onClick={handleUpload}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
