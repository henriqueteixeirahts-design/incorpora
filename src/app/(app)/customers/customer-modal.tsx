"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Tabs, type TabDef } from "@/components/Tabs";
import { TrashIcon, DownloadIcon } from "@/components/icons";
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
}: {
  mode: "create" | "edit";
  customer: CustomerDetail | null;
  onClose: () => void;
  onCreated: (customer: CustomerDetail) => void;
}) {
  const [activeTab, setActiveTab] = useState("dados");
  const formAction = mode === "create" ? createCustomerAction : updateCustomerAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);
  const dadosFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.success || !state.customerId) return;
    getCustomerDetailAction(state.customerId).then((detail) => {
      if (detail) onCreated(detail);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success, state.customerId]);

  const isEditing = mode === "edit" && !!customer;
  const dependentTabsDisabled = !isEditing;

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
          <button type="button" className="secondary" onClick={onClose}>
            Fechar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => dadosFormRef.current?.requestSubmit()}
          >
            {pending ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div hidden={activeTab !== "dados"}>
        <form id="customer-dados-form" ref={dadosFormRef} action={dispatch}>
          {mode === "edit" && customer ? (
            <input type="hidden" name="customerId" value={customer.id} />
          ) : null}

          <div className="field-section">
            <h3>Identificação</h3>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="type">Tipo *</label>
                <select id="type" name="type" defaultValue={customer?.type ?? "INDIVIDUAL"}>
                  <option value="INDIVIDUAL">Pessoa física</option>
                  <option value="COMPANY">Pessoa jurídica</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="name">Nome *</label>
                <input id="name" name="name" required defaultValue={customer?.name ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="document">CPF/CNPJ *</label>
                <input
                  id="document"
                  name="document"
                  required
                  defaultValue={customer?.document ?? ""}
                />
              </div>
            </div>
          </div>

          <div className="field-section">
            <h3>Contato</h3>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={customer?.email ?? ""}
                />
              </div>
              <div className="field">
                <label htmlFor="phone">Telefone</label>
                <input id="phone" name="phone" defaultValue={customer?.phone ?? ""} />
              </div>
            </div>
          </div>

          <div className="field-section">
            <h3>Endereço</h3>
            <div className="field-grid">
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="address">Endereço</label>
                <input id="address" name="address" defaultValue={customer?.address ?? ""} />
              </div>
            </div>
          </div>

          <div className="field-section">
            <h3>Observações</h3>
            <div className="field">
              <textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={customer?.notes ?? ""}
              />
            </div>
          </div>

          {state.error ? <p className="error-text">{state.error}</p> : null}
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
        <p className="field-hint">Nenhum contato adicional cadastrado.</p>
      ) : (
        <table className="data-table" style={{ marginBottom: "1rem" }}>
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
                <td>{contact.name}</td>
                <td>{contact.role || "—"}</td>
                <td>{contact.email || "—"}</td>
                <td>{contact.phone || "—"}</td>
                <td>
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label={`Remover ${contact.name}`}
                    disabled={busy}
                    onClick={() => handleDelete(contact.id)}
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="field-section">
        <h3>Adicionar contato</h3>
        <div className="field-grid">
          <div className="field">
            <label>Nome *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Cargo/Relação</label>
            <input value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <div className="field">
            <label>E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Telefone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <button
          type="button"
          className="secondary"
          style={{ marginTop: "0.75rem" }}
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
        <p className="field-hint">Nenhum anexo enviado.</p>
      ) : (
        <table className="data-table" style={{ marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th>Arquivo</th>
              <th>Categoria</th>
              <th>Enviado em</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {customer.documents.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.fileName}</td>
                <td>{DOCUMENT_CATEGORY_LABELS[doc.category] ?? doc.category}</td>
                <td>{new Date(doc.createdAt).toLocaleDateString("pt-BR")}</td>
                <td>
                  <div className="row-actions">
                    {doc.signedUrl ? (
                      <a
                        className="icon-btn"
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
                      className="icon-btn danger"
                      aria-label={`Remover ${doc.fileName}`}
                      disabled={busy}
                      onClick={() => handleDelete(doc.id)}
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

      <div className="field-section">
        <h3>Enviar anexo</h3>
        <div className="field-grid">
          <div className="field">
            <label>Categoria</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Arquivo</label>
            <input ref={fileInputRef} type="file" />
          </div>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <button
          type="button"
          className="secondary"
          style={{ marginTop: "0.75rem" }}
          disabled={busy}
          onClick={handleUpload}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
