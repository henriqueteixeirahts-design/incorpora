"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Tabs, type TabDef } from "@/components/Tabs";
import { TrashIcon, DownloadIcon } from "@/components/icons";
import {
  formatDocument,
  formatPhone,
  formatCep,
  onlyDigits,
} from "@/lib/br-validation";
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
  const formAction = mode === "create" ? createCustomerAction : updateCustomerAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);
  const dadosFormRef = useRef<HTMLFormElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const cepInputRef = useRef<HTMLInputElement>(null);
  const streetInputRef = useRef<HTMLInputElement>(null);
  const neighborhoodInputRef = useRef<HTMLInputElement>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const stateInputRef = useRef<HTMLInputElement>(null);
  const [cepStatus, setCepStatus] = useState<string | null>(null);

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

  async function handleCepBlur() {
    const cep = onlyDigits(cepInputRef.current?.value ?? "");
    if (cepInputRef.current) cepInputRef.current.value = formatCep(cep);
    if (cep.length !== 8) return;

    setCepStatus("Buscando...");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.erro) {
        setCepStatus("CEP não encontrado — preencha o endereço manualmente.");
        return;
      }
      if (streetInputRef.current && !streetInputRef.current.value) streetInputRef.current.value = data.logradouro ?? "";
      if (neighborhoodInputRef.current) neighborhoodInputRef.current.value = data.bairro ?? "";
      if (cityInputRef.current) cityInputRef.current.value = data.localidade ?? "";
      if (stateInputRef.current) stateInputRef.current.value = data.uf ?? "";
      setCepStatus(null);
    } catch {
      setCepStatus("Não foi possível consultar o CEP agora — preencha o endereço manualmente.");
    }
  }

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
      {isEditing && customer!.audit ? (
        <p className="field-hint" style={{ marginTop: 0, marginBottom: "0.75rem" }}>
          Cadastrado por {customer!.audit.createdByName ?? "—"} em{" "}
          {new Date(customer!.audit.createdAt).toLocaleString("pt-BR")}
          {customer!.audit.updatedAt !== customer!.audit.createdAt ? (
            <>
              {" "}
              · Última alteração por {customer!.audit.updatedByName ?? "—"} em{" "}
              {new Date(customer!.audit.updatedAt).toLocaleString("pt-BR")}
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

          <div className="field-section">
            <h3>Identificação</h3>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="type">Tipo *</label>
                <select
                  id="type"
                  name="type"
                  defaultValue={customer?.type ?? "INDIVIDUAL"}
                  onChange={(e) => {
                    const next = e.target.value as "INDIVIDUAL" | "COMPANY";
                    setDocumentType(next);
                    if (documentInputRef.current) {
                      documentInputRef.current.value = formatDocument(documentInputRef.current.value, next);
                    }
                  }}
                >
                  <option value="INDIVIDUAL">Pessoa física</option>
                  <option value="COMPANY">Pessoa jurídica</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="name">Nome *</label>
                <input id="name" name="name" required defaultValue={customer?.name ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="document">{documentType === "COMPANY" ? "CNPJ *" : "CPF *"}</label>
                <input
                  id="document"
                  name="document"
                  ref={documentInputRef}
                  required
                  placeholder={documentType === "COMPANY" ? "00.000.000/0000-00" : "000.000.000-00"}
                  defaultValue={customer ? formatDocument(customer.document, customer.type) : ""}
                  onBlur={(e) => {
                    e.target.value = formatDocument(e.target.value, documentType);
                  }}
                />
              </div>
            </div>
          </div>

          <div className="field-section">
            <h3>Contato</h3>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="email">E-mail *</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  defaultValue={customer?.email ?? ""}
                />
              </div>
              <div className="field">
                <label htmlFor="phone">Telefone *</label>
                <input
                  id="phone"
                  name="phone"
                  ref={phoneInputRef}
                  required
                  placeholder="(00) 00000-0000"
                  defaultValue={customer?.phone ? formatPhone(customer.phone) : ""}
                  onBlur={(e) => {
                    e.target.value = formatPhone(e.target.value);
                  }}
                />
              </div>
            </div>
          </div>

          <div className="field-section">
            <h3>Endereço</h3>
            {hasLegacyAddress ? (
              <p className="field-hint">Endereço legado (cadastro anterior): {customer!.address}</p>
            ) : null}
            <div className="field-grid">
              <div className="field">
                <label htmlFor="zipCode">CEP</label>
                <input
                  id="zipCode"
                  name="zipCode"
                  ref={cepInputRef}
                  placeholder="00000-000"
                  defaultValue={customer?.zipCode ? formatCep(customer.zipCode) : ""}
                  onBlur={handleCepBlur}
                />
                {cepStatus ? <span style={{ fontSize: "0.75rem", opacity: 0.75 }}>{cepStatus}</span> : null}
              </div>
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label htmlFor="street">Logradouro</label>
                <input id="street" name="street" ref={streetInputRef} defaultValue={customer?.street ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="number">Número</label>
                <input id="number" name="number" defaultValue={customer?.number ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="complement">Complemento</label>
                <input id="complement" name="complement" defaultValue={customer?.complement ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="neighborhood">Bairro</label>
                <input
                  id="neighborhood"
                  name="neighborhood"
                  ref={neighborhoodInputRef}
                  defaultValue={customer?.neighborhood ?? ""}
                />
              </div>
              <div className="field">
                <label htmlFor="city">Cidade</label>
                <input id="city" name="city" ref={cityInputRef} defaultValue={customer?.city ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="state">UF</label>
                <input
                  id="state"
                  name="state"
                  ref={stateInputRef}
                  maxLength={2}
                  style={{ textTransform: "uppercase" }}
                  defaultValue={customer?.state ?? ""}
                />
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

          {state.error ? (
            <p className="error-text">
              {state.error}
              {state.duplicateCustomerId ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="secondary"
                    style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}
                    onClick={() => onOpenDuplicate(state.duplicateCustomerId!)}
                  >
                    Abrir cadastro existente
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
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
                <td>{contact.phone ? formatPhone(contact.phone) : "—"}</td>
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
        <p className="field-hint" style={{ marginTop: 0 }}>
          Informe nome e pelo menos um e-mail ou telefone.
        </p>
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
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={(e) => setPhone(formatPhone(e.target.value))}
            />
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
