"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Tabs, type TabDef } from "@/components/Tabs";
import { AddressFields } from "@/components/AddressFields";
import { TrashIcon, DownloadIcon } from "@/components/icons";
import { formatCnpj, formatPhone, formatDocument } from "@/lib/br-validation";
import {
  createSpeAction,
  updateSpeAction,
  getSpeDetailAction,
  getActiveBankAccountsAction,
  linkSpeBankAccountAction,
  unlinkSpeBankAccountAction,
  setPrimarySpeBankAccountAction,
  createSpePartnerAction,
  updateSpePartnerAction,
  deleteSpePartnerAction,
  createSpeInvestorAction,
  updateSpeInvestorAction,
  deleteSpeInvestorAction,
  uploadSpeDocumentAction,
  deleteSpeDocumentAction,
  type CreateSpeState,
  type FormState,
} from "./actions";

export type SpeDetail = NonNullable<Awaited<ReturnType<typeof getSpeDetailAction>>>;

const LEGAL_NATURE_SUGGESTIONS = [
  "206-2 Sociedade Empresária Limitada",
  "224-8 Sociedade Anônima Aberta",
  "223-0 Sociedade Anônima Fechada",
  "213-5 Empresário Individual",
  "230-5 Empresa Individual de Responsabilidade Limitada",
];

const initialState: CreateSpeState = {};

const PLACEHOLDER_TABS: { id: string; label: string; note: string }[] = [
  { id: "terrenos", label: "Terrenos", note: "Terrenos vinculados à SPE, com situação legal e afetação — etapa 5 do plano." },
  { id: "contabil", label: "Contábil", note: "Regime tributário (inclusive RET) e dados para integração contábil — etapa 6 do plano." },
];

const SPE_DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  ARTICLES_OF_ASSOCIATION: "Contrato social / alterações contratuais",
  CNPJ_CARD: "Cartão CNPJ",
  CLEARANCE_CERTIFICATE: "Certidões (negativas fiscais, FGTS, trabalhista)",
  POWER_OF_ATTORNEY: "Procurações",
  AFFECTATION_DEED: "Termo de afetação / averbação na matrícula",
  RET_OPTION_TERM: "Termo de opção pelo RET",
  PERMIT_LICENSE: "Alvarás e licenças",
  OTHER: "Outros",
};

function SpeDocumentsTab({ spe, onRefresh }: { spe: SpeDetail; onRefresh: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("ARTICLES_OF_ASSOCIATION");
  const [description, setDescription] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    if (description) formData.set("description", description);
    if (expiresAt) formData.set("expiresAt", expiresAt);

    setBusy(true);
    const result = await uploadSpeDocumentAction(spe.id, formData);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    setDescription("");
    setExpiresAt("");
    onRefresh();
  }

  async function handleDelete(documentId: string) {
    if (!confirm("Remover este anexo?")) return;
    setBusy(true);
    await deleteSpeDocumentAction(spe.id, documentId);
    setBusy(false);
    onRefresh();
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      {spe.documents.length === 0 ? (
        <p className="field-hint">Nenhum anexo enviado.</p>
      ) : (
        <table className="data-table" style={{ marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th>Arquivo</th>
              <th>Categoria</th>
              <th>Descrição</th>
              <th>Validade</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {spe.documents.map((doc) => {
              const expired = doc.expiresAt ? new Date(doc.expiresAt).toISOString().slice(0, 10) < today : false;
              return (
                <tr key={doc.id}>
                  <td>{doc.fileName}</td>
                  <td>{SPE_DOCUMENT_CATEGORY_LABELS[doc.category] ?? doc.category}</td>
                  <td>{doc.description ?? "—"}</td>
                  <td style={expired ? { color: "var(--danger-color, #b91c1c)" } : undefined}>
                    {doc.expiresAt
                      ? new Date(doc.expiresAt).toLocaleDateString("pt-BR") + (expired ? " (vencida)" : "")
                      : "—"}
                  </td>
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
              );
            })}
          </tbody>
        </table>
      )}

      <div className="field-section">
        <h3>Enviar anexo</h3>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="spe-doc-category">Categoria</label>
            <select id="spe-doc-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(SPE_DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="spe-doc-description">Descrição</label>
            <input
              id="spe-doc-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="spe-doc-expires">Data de validade</label>
            <input
              id="spe-doc-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="spe-doc-file">Arquivo</label>
            <input id="spe-doc-file" ref={fileInputRef} type="file" />
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

const PARTNER_ROLE_LABELS: Record<string, string> = {
  ADMINISTRATOR: "Sócio administrador",
  QUOTAHOLDER: "Sócio quotista",
  OTHER: "Outro",
};

const INVESTOR_MODALITY_LABELS: Record<string, string> = {
  EQUITY: "Equity (participação)",
  LOAN: "Mútuo",
  PHYSICAL_EXCHANGE: "Permuta física",
  FINANCIAL_EXCHANGE: "Permuta financeira",
  OTHER: "Outro",
};

const partnerFormInitialState: FormState = {};

type SpePartnerRow = SpeDetail["partners"][number];

function SpePartnerForm({
  speId,
  partner,
  onSaved,
  onCancel,
}: {
  speId: string;
  partner: SpePartnerRow | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const formAction = partner ? updateSpePartnerAction : createSpePartnerAction;
  const [state, dispatch, pending] = useActionState(formAction, partnerFormInitialState);
  const [type, setType] = useState<"INDIVIDUAL" | "COMPANY">(partner?.type ?? "INDIVIDUAL");

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form ref={formRef} action={dispatch} className="field-section">
      <h3>{partner ? "Editar sócio" : "Adicionar sócio"}</h3>
      <input type="hidden" name="speId" value={speId} />
      {partner ? <input type="hidden" name="partnerId" value={partner.id} /> : null}
      <div className="field-grid">
        <div className="field">
          <label htmlFor="partner-type">Tipo *</label>
          <select
            id="partner-type"
            name="type"
            required
            value={type}
            onChange={(e) => setType(e.target.value as "INDIVIDUAL" | "COMPANY")}
          >
            <option value="INDIVIDUAL">Pessoa física</option>
            <option value="COMPANY">Pessoa jurídica</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="partner-name">Nome / Razão social *</label>
          <input id="partner-name" name="name" required defaultValue={partner?.name ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="partner-document">{type === "COMPANY" ? "CNPJ *" : "CPF *"}</label>
          <input
            id="partner-document"
            name="document"
            required
            defaultValue={partner ? formatDocument(partner.document, partner.type) : ""}
            onBlur={(e) => {
              e.target.value = formatDocument(e.target.value, type);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="partner-pct">Participação (%) *</label>
          <input
            id="partner-pct"
            name="participationPct"
            type="number"
            step="0.001"
            min="0"
            max="100"
            required
            defaultValue={partner?.participationPct ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="partner-role">Papel</label>
          <select id="partner-role" name="role" defaultValue={partner?.role ?? ""}>
            <option value="">—</option>
            <option value="ADMINISTRATOR">Sócio administrador</option>
            <option value="QUOTAHOLDER">Sócio quotista</option>
            <option value="OTHER">Outro</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="partner-start">Data de entrada</label>
          <input
            id="partner-start"
            name="startDate"
            type="date"
            defaultValue={partner?.startDate ? new Date(partner.startDate).toISOString().slice(0, 10) : ""}
          />
        </div>
        <div className="field">
          <label htmlFor="partner-end">Data de saída</label>
          <input
            id="partner-end"
            name="endDate"
            type="date"
            defaultValue={partner?.endDate ? new Date(partner.endDate).toISOString().slice(0, 10) : ""}
          />
        </div>
      </div>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button type="button" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
          {pending ? "Salvando..." : "Salvar sócio"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function SpePartnersTab({ spe, onRefresh }: { spe: SpeDetail; onRefresh: () => void }) {
  const [editing, setEditing] = useState<SpePartnerRow | null | "new">(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(partner: SpePartnerRow) {
    if (!confirm(`Remover o sócio "${partner.name}" do quadro societário?`)) return;
    setDeleteError(null);
    const result = await deleteSpePartnerAction(spe.id, partner.id);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    onRefresh();
  }

  const total = spe.activePartnersParticipationTotal;
  const totalIsOff = Math.abs(total - 100) > 0.001;

  return (
    <div>
      {totalIsOff ? (
        <p className="field-hint" style={{ color: "var(--warning-color, #b45309)" }}>
          Atenção: a soma da participação dos sócios ativos é {total.toLocaleString("pt-BR")}%, diferente de
          100%. Isso é esperado durante uma alteração societária em andamento, mas confira antes de fechar o
          quadro.
        </p>
      ) : null}

      {deleteError ? <p className="error-text">{deleteError}</p> : null}

      {spe.partners.length === 0 ? (
        <p className="field-hint">Nenhum sócio cadastrado.</p>
      ) : (
        <table className="data-table" style={{ marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Documento</th>
              <th>Participação</th>
              <th>Papel</th>
              <th>Entrada</th>
              <th>Saída</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {spe.partners.map((partner) => (
              <tr key={partner.id}>
                <td>{partner.name}</td>
                <td>{formatDocument(partner.document, partner.type)}</td>
                <td>{partner.participationPct.toLocaleString("pt-BR")}%</td>
                <td>{partner.role ? PARTNER_ROLE_LABELS[partner.role] : "—"}</td>
                <td>{partner.startDate ? new Date(partner.startDate).toLocaleDateString("pt-BR") : "—"}</td>
                <td>{partner.endDate ? new Date(partner.endDate).toLocaleDateString("pt-BR") : "—"}</td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="secondary" onClick={() => setEditing(partner)}>
                      Editar
                    </button>
                    <button type="button" className="secondary" onClick={() => handleDelete(partner)}>
                      Remover
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing ? (
        <SpePartnerForm
          key={editing === "new" ? "new" : editing.id}
          speId={spe.id}
          partner={editing === "new" ? null : editing}
          onSaved={() => {
            setEditing(null);
            onRefresh();
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" onClick={() => setEditing("new")}>
          + Adicionar sócio
        </button>
      )}
    </div>
  );
}

const investorFormInitialState: FormState = {};

type SpeInvestorRow = SpeDetail["investors"][number];

function SpeInvestorForm({
  speId,
  investor,
  onSaved,
  onCancel,
}: {
  speId: string;
  investor: SpeInvestorRow | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const formAction = investor ? updateSpeInvestorAction : createSpeInvestorAction;
  const [state, dispatch, pending] = useActionState(formAction, investorFormInitialState);
  const [type, setType] = useState<"INDIVIDUAL" | "COMPANY">(investor?.type ?? "INDIVIDUAL");

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form ref={formRef} action={dispatch} className="field-section">
      <h3>{investor ? "Editar investidor" : "Adicionar investidor"}</h3>
      <input type="hidden" name="speId" value={speId} />
      {investor ? <input type="hidden" name="investorId" value={investor.id} /> : null}
      <div className="field-grid">
        <div className="field">
          <label htmlFor="investor-type">Tipo *</label>
          <select
            id="investor-type"
            name="type"
            required
            value={type}
            onChange={(e) => setType(e.target.value as "INDIVIDUAL" | "COMPANY")}
          >
            <option value="INDIVIDUAL">Pessoa física</option>
            <option value="COMPANY">Pessoa jurídica</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="investor-name">Nome / Razão social *</label>
          <input id="investor-name" name="name" required defaultValue={investor?.name ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="investor-document">{type === "COMPANY" ? "CNPJ *" : "CPF *"}</label>
          <input
            id="investor-document"
            name="document"
            required
            defaultValue={investor ? formatDocument(investor.document, investor.type) : ""}
            onBlur={(e) => {
              e.target.value = formatDocument(e.target.value, type);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="investor-email">E-mail *</label>
          <input id="investor-email" name="email" type="email" required defaultValue={investor?.email ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="investor-phone">Telefone *</label>
          <input
            id="investor-phone"
            name="phone"
            required
            defaultValue={investor?.phone ? formatPhone(investor.phone) : ""}
            onBlur={(e) => {
              e.target.value = formatPhone(e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="investor-modality">Modalidade *</label>
          <select id="investor-modality" name="modality" required defaultValue={investor?.modality ?? "EQUITY"}>
            <option value="EQUITY">Equity (participação)</option>
            <option value="LOAN">Mútuo</option>
            <option value="PHYSICAL_EXCHANGE">Permuta física</option>
            <option value="FINANCIAL_EXCHANGE">Permuta financeira</option>
            <option value="OTHER">Outro</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="investor-capital">Capital aportado (R$)</label>
          <input
            id="investor-capital"
            name="contributedCapital"
            type="number"
            step="0.01"
            min="0"
            defaultValue={investor?.contributedCapital ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="investor-result-pct">Participação no resultado (%)</label>
          <input
            id="investor-result-pct"
            name="resultParticipationPct"
            type="number"
            step="0.001"
            min="0"
            max="100"
            defaultValue={investor?.resultParticipationPct ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="investor-date">Data do aporte</label>
          <input
            id="investor-date"
            name="contributionDate"
            type="date"
            defaultValue={
              investor?.contributionDate ? new Date(investor.contributionDate).toISOString().slice(0, 10) : ""
            }
          />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="investor-notes">Observações</label>
          <input id="investor-notes" name="notes" defaultValue={investor?.notes ?? ""} />
        </div>
      </div>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button type="button" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
          {pending ? "Salvando..." : "Salvar investidor"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function SpeInvestorsTab({ spe, onRefresh }: { spe: SpeDetail; onRefresh: () => void }) {
  const [editing, setEditing] = useState<SpeInvestorRow | null | "new">(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(investor: SpeInvestorRow) {
    if (!confirm(`Remover o investidor "${investor.name}"?`)) return;
    setDeleteError(null);
    const result = await deleteSpeInvestorAction(spe.id, investor.id);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    onRefresh();
  }

  return (
    <div>
      {deleteError ? <p className="error-text">{deleteError}</p> : null}

      {spe.investors.length === 0 ? (
        <p className="field-hint">Nenhum investidor cadastrado.</p>
      ) : (
        <table className="data-table" style={{ marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Documento</th>
              <th>Contato</th>
              <th>Modalidade</th>
              <th>Capital aportado</th>
              <th>% resultado</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {spe.investors.map((investor) => (
              <tr key={investor.id}>
                <td>{investor.name}</td>
                <td>{formatDocument(investor.document, investor.type)}</td>
                <td>
                  {investor.email}
                  <br />
                  {formatPhone(investor.phone)}
                </td>
                <td>{INVESTOR_MODALITY_LABELS[investor.modality] ?? investor.modality}</td>
                <td>
                  {investor.contributedCapital !== null
                    ? investor.contributedCapital.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                    : "—"}
                </td>
                <td>
                  {investor.resultParticipationPct !== null
                    ? `${investor.resultParticipationPct.toLocaleString("pt-BR")}%`
                    : "—"}
                </td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="secondary" onClick={() => setEditing(investor)}>
                      Editar
                    </button>
                    <button type="button" className="secondary" onClick={() => handleDelete(investor)}>
                      Remover
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing ? (
        <SpeInvestorForm
          key={editing === "new" ? "new" : editing.id}
          speId={spe.id}
          investor={editing === "new" ? null : editing}
          onSaved={() => {
            setEditing(null);
            onRefresh();
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" onClick={() => setEditing("new")}>
          + Adicionar investidor
        </button>
      )}
    </div>
  );
}

const BANK_ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CHECKING: "Corrente",
  SAVINGS: "Poupança",
  PAYMENT: "Pagamento",
};

type ActiveBankAccount = Awaited<ReturnType<typeof getActiveBankAccountsAction>>[number];

function SpeBankAccountsTab({
  spe,
  onRefresh,
}: {
  spe: SpeDetail;
  onRefresh: () => void;
}) {
  const [availableAccounts, setAvailableAccounts] = useState<ActiveBankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [markPrimary, setMarkPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    getActiveBankAccountsAction().then(setAvailableAccounts);
  }, []);

  const linkedIds = new Set(spe.bankAccountLinks.map((link) => link.bankAccountId));
  const linkableAccounts = availableAccounts.filter((account) => !linkedIds.has(account.id));

  async function handleLink() {
    if (!selectedAccountId) {
      setError("Selecione uma conta.");
      return;
    }
    setError(null);
    setPending(true);
    const result = await linkSpeBankAccountAction(spe.id, selectedAccountId, markPrimary);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSelectedAccountId("");
    setMarkPrimary(false);
    onRefresh();
  }

  async function handleUnlink(bankAccountId: string, label: string) {
    if (!confirm(`Desvincular a conta "${label}" desta SPE?`)) return;
    setError(null);
    const result = await unlinkSpeBankAccountAction(spe.id, bankAccountId);
    if (result.error) {
      setError(result.error);
      return;
    }
    onRefresh();
  }

  async function handleSetPrimary(bankAccountId: string) {
    setError(null);
    const result = await setPrimarySpeBankAccountAction(spe.id, bankAccountId);
    if (result.error) {
      setError(result.error);
      return;
    }
    onRefresh();
  }

  return (
    <div>
      {spe.bankAccountLinks.length === 0 ? (
        <p className="field-hint">Nenhuma conta vinculada a esta SPE.</p>
      ) : (
        <table className="data-table" style={{ marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th>Banco</th>
              <th>Agência/Conta</th>
              <th>Tipo</th>
              <th>Principal</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {spe.bankAccountLinks.map((link) => (
              <tr key={link.id}>
                <td>{link.bankAccount.bankName}</td>
                <td>
                  {link.bankAccount.agency} / {link.bankAccount.account}
                </td>
                <td>{BANK_ACCOUNT_TYPE_LABELS[link.bankAccount.type] ?? link.bankAccount.type}</td>
                <td>
                  {link.isPrimary ? (
                    "Principal"
                  ) : (
                    <button type="button" className="secondary" onClick={() => handleSetPrimary(link.bankAccountId)}>
                      Tornar principal
                    </button>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => handleUnlink(link.bankAccountId, link.bankAccount.bankName)}
                  >
                    Desvincular
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="field-section">
        <h3>Vincular conta</h3>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="bank-account-select">Conta cadastrada</label>
            <select
              id="bank-account-select"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {linkableAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.bankName} — {account.agency}/{account.account}
                  {account.nickname ? ` (${account.nickname})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <input
                type="checkbox"
                checked={markPrimary}
                onChange={(e) => setMarkPrimary(e.target.checked)}
              />
              Definir como principal
            </label>
          </div>
        </div>
        {linkableAccounts.length === 0 && availableAccounts.length > 0 ? (
          <p className="field-hint">Todas as contas cadastradas já estão vinculadas a esta SPE.</p>
        ) : null}
        {availableAccounts.length === 0 ? (
          <p className="field-hint">
            Nenhuma conta bancária ativa cadastrada. Cadastre em Configurações → Financeiro → Contas
            bancárias.
          </p>
        ) : null}
        <button type="button" disabled={pending || !selectedAccountId} onClick={handleLink} style={{ marginTop: "0.75rem" }}>
          {pending ? "Vinculando..." : "Vincular conta"}
        </button>
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    </div>
  );
}

export function SpeModal({
  mode,
  spe,
  onClose,
  onCreated,
  onOpenDuplicate,
}: {
  mode: "create" | "edit";
  spe: SpeDetail | null;
  onClose: () => void;
  onCreated: (spe: SpeDetail) => void;
  onOpenDuplicate: (speId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState("dados");
  const formAction = mode === "create" ? createSpeAction : updateSpeAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);
  const dadosFormRef = useRef<HTMLFormElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.success || !state.speId) return;
    getSpeDetailAction(state.speId).then((detail) => {
      if (detail) onCreated(detail);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success, state.speId]);

  const isEditing = mode === "edit" && !!spe;
  const hasLegacyAddress = !!spe?.address && !spe.street && !spe.city && !spe.zipCode;

  async function refreshSpe() {
    if (!spe) return;
    const detail = await getSpeDetailAction(spe.id);
    if (detail) onCreated(detail);
  }

  const tabs: TabDef[] = [
    { id: "dados", label: "Dados" },
    { id: "socios", label: "Sócios" },
    { id: "contas", label: "Contas bancárias" },
    { id: "investidores", label: "Investidores" },
    { id: "documentacao", label: "Documentação" },
    ...PLACEHOLDER_TABS.map((tab) => ({ id: tab.id, label: tab.label })),
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? `Editar SPE — ${spe!.name}` : "Nova SPE"}
      width={720}
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose}>
            Fechar
          </button>
          <button type="button" disabled={pending} onClick={() => dadosFormRef.current?.requestSubmit()}>
            {pending ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      {isEditing && spe!.audit ? (
        <p className="field-hint" style={{ marginTop: 0, marginBottom: "0.75rem" }}>
          Cadastrado por {spe!.audit.createdByName ?? "—"} em{" "}
          {new Date(spe!.audit.createdAt).toLocaleString("pt-BR")}
          {spe!.audit.updatedAt !== spe!.audit.createdAt ? (
            <>
              {" "}
              · Última alteração por {spe!.audit.updatedByName ?? "—"} em{" "}
              {new Date(spe!.audit.updatedAt).toLocaleString("pt-BR")}
            </>
          ) : null}
        </p>
      ) : null}

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div hidden={activeTab !== "dados"}>
        <form id="spe-dados-form" ref={dadosFormRef} action={dispatch}>
          {mode === "edit" && spe ? <input type="hidden" name="speId" value={spe.id} /> : null}

          <div className="field-section">
            <h3>Identificação</h3>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="name">Razão social *</label>
                <input id="name" name="name" required defaultValue={spe?.name ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="tradeName">Nome fantasia</label>
                <input id="tradeName" name="tradeName" defaultValue={spe?.tradeName ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="document">CNPJ *</label>
                <input
                  id="document"
                  name="document"
                  ref={documentInputRef}
                  required
                  placeholder="00.000.000/0000-00"
                  defaultValue={spe ? formatCnpj(spe.document) : ""}
                  onBlur={(e) => {
                    e.target.value = formatCnpj(e.target.value);
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="nire">NIRE</label>
                <input id="nire" name="nire" defaultValue={spe?.nire ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="foundedAt">Data de constituição</label>
                <input
                  id="foundedAt"
                  name="foundedAt"
                  type="date"
                  defaultValue={spe?.foundedAt ? new Date(spe.foundedAt).toISOString().slice(0, 10) : ""}
                />
              </div>
              <div className="field">
                <label htmlFor="status">Situação *</label>
                <select id="status" name="status" required defaultValue={spe?.status ?? "ACTIVE"}>
                  <option value="ACTIVE">Ativa</option>
                  <option value="IN_FORMATION">Em constituição</option>
                  <option value="CLOSED">Encerrada</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="legalNature">Natureza jurídica</label>
                <input
                  id="legalNature"
                  name="legalNature"
                  list="legal-nature-options"
                  defaultValue={spe?.legalNature ?? ""}
                />
                <datalist id="legal-nature-options">
                  {LEGAL_NATURE_SUGGESTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="cnae">CNAE principal</label>
                <input
                  id="cnae"
                  name="cnae"
                  placeholder="41.10-7-00 Incorporação de empreendimentos imobiliários"
                  defaultValue={spe?.cnae ?? ""}
                />
              </div>
            </div>
          </div>

          <div className="field-section">
            <h3>Contato</h3>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="email">E-mail *</label>
                <input id="email" name="email" type="email" required defaultValue={spe?.email ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="phone">Telefone *</label>
                <input
                  id="phone"
                  name="phone"
                  ref={phoneInputRef}
                  required
                  placeholder="(00) 00000-0000"
                  defaultValue={spe?.phone ? formatPhone(spe.phone) : ""}
                  onBlur={(e) => {
                    e.target.value = formatPhone(e.target.value);
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="website">Site</label>
                <input id="website" name="website" defaultValue={spe?.website ?? ""} />
              </div>
            </div>
          </div>

          <AddressFields
            defaultValues={spe ?? undefined}
            legacyNote={hasLegacyAddress ? `Endereço legado (cadastro anterior): ${spe!.address}` : null}
          />

          {state.error ? (
            <p className="error-text">
              {state.error}
              {state.duplicateSpeId ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="secondary"
                    style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}
                    onClick={() => onOpenDuplicate(state.duplicateSpeId!)}
                  >
                    Abrir cadastro existente
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </form>
      </div>

      <div hidden={activeTab !== "socios"}>
        {isEditing ? (
          <SpePartnersTab spe={spe!} onRefresh={refreshSpe} />
        ) : (
          <p className="field-hint">Salve os dados da SPE primeiro para cadastrar o quadro societário.</p>
        )}
      </div>

      <div hidden={activeTab !== "contas"}>
        {isEditing ? (
          <SpeBankAccountsTab spe={spe!} onRefresh={refreshSpe} />
        ) : (
          <p className="field-hint">Salve os dados da SPE primeiro para vincular contas bancárias.</p>
        )}
      </div>

      <div hidden={activeTab !== "investidores"}>
        {isEditing ? (
          <SpeInvestorsTab spe={spe!} onRefresh={refreshSpe} />
        ) : (
          <p className="field-hint">Salve os dados da SPE primeiro para cadastrar investidores.</p>
        )}
      </div>

      <div hidden={activeTab !== "documentacao"}>
        {isEditing ? (
          <SpeDocumentsTab spe={spe!} onRefresh={refreshSpe} />
        ) : (
          <p className="field-hint">Salve os dados da SPE primeiro para enviar anexos.</p>
        )}
      </div>

      {PLACEHOLDER_TABS.map((tab) => (
        <div key={tab.id} hidden={activeTab !== tab.id}>
          <p className="field-hint">Em breve: {tab.note}</p>
        </div>
      ))}
    </Modal>
  );
}
