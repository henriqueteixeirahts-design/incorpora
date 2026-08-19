"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Tabs, type TabDef } from "@/components/Tabs";
import { AddressFields } from "@/components/AddressFields";
import { TrashIcon, DownloadIcon } from "@/components/icons";
import { formatCnpj, formatPhone, formatDocument } from "@/lib/br-validation";
import { formatCurrencyBRL, formatDateTimeBR, formatCalendarDateBR } from "@/lib/format";
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
  createSpeLandAction,
  updateSpeLandAction,
  deleteSpeLandAction,
  updateSpeAccountingAction,
  getIndexRulesAction,
  getSpeContributionSummaryAction,
  type CreateSpeState,
  type FormState,
} from "./actions";
import { InvestorContributionsPanel } from "./investor-contributions";

export type SpeDetail = NonNullable<Awaited<ReturnType<typeof getSpeDetailAction>>>;

const LEGAL_NATURE_SUGGESTIONS = [
  "206-2 Sociedade Empresária Limitada",
  "224-8 Sociedade Anônima Aberta",
  "223-0 Sociedade Anônima Fechada",
  "213-5 Empresário Individual",
  "230-5 Empresa Individual de Responsabilidade Limitada",
];

const initialState: CreateSpeState = {};

const accountingFormInitialState: FormState = {};

function SpeAccountingTab({ spe, onRefresh }: { spe: SpeDetail; onRefresh: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, dispatch, pending] = useActionState(updateSpeAccountingAction, accountingFormInitialState);
  const [taxRegime, setTaxRegime] = useState(spe.taxRegime ?? "");

  useEffect(() => {
    if (state.success) onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  const isRet = taxRegime === "RET";

  return (
    <form ref={formRef} action={dispatch}>
      <input type="hidden" name="speId" value={spe.id} />

      <div className="field-section">
        <h3>Regime tributário</h3>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="taxRegime">Regime</label>
            <select
              id="taxRegime"
              name="taxRegime"
              value={taxRegime}
              onChange={(e) => setTaxRegime(e.target.value)}
            >
              <option value="">—</option>
              <option value="ACTUAL_PROFIT">Lucro Real</option>
              <option value="PRESUMED_PROFIT">Lucro Presumido</option>
              <option value="SIMPLES_NACIONAL">Simples Nacional</option>
              <option value="RET">RET (Regime Especial de Tributação)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="retOptionSince">Optante pelo RET desde</label>
            <input
              id="retOptionSince"
              name="retOptionSince"
              type="date"
              disabled={!isRet}
              defaultValue={spe.retOptionSince ? new Date(spe.retOptionSince).toISOString().slice(0, 10) : ""}
            />
          </div>
          <div className="field">
            <label htmlFor="event109Cnpj">CNPJ do evento 109</label>
            <input
              id="event109Cnpj"
              name="event109Cnpj"
              disabled={!isRet}
              placeholder="Inscrição da incorporação afetada"
              defaultValue={spe.event109Cnpj ? formatCnpj(spe.event109Cnpj) : ""}
              onBlur={(e) => {
                if (e.target.value) e.target.value = formatCnpj(e.target.value);
              }}
            />
          </div>
        </div>
      </div>

      <div className="field-section">
        <h3>Escrituração e responsáveis</h3>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="accountantName">Contador responsável</label>
            <input id="accountantName" name="accountantName" defaultValue={spe.accountantName ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="accountantCrc">CRC</label>
            <input id="accountantCrc" name="accountantCrc" defaultValue={spe.accountantCrc ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="accountantEmail">E-mail do contador</label>
            <input id="accountantEmail" name="accountantEmail" type="email" defaultValue={spe.accountantEmail ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="accountantPhone">Telefone do contador</label>
            <input
              id="accountantPhone"
              name="accountantPhone"
              defaultValue={spe.accountantPhone ? formatPhone(spe.accountantPhone) : ""}
              onBlur={(e) => {
                if (e.target.value) e.target.value = formatPhone(e.target.value);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="accountingFirm">Escritório de contabilidade</label>
            <input id="accountingFirm" name="accountingFirm" defaultValue={spe.accountingFirm ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="externalAccountingCode">Código no sistema contábil externo</label>
            <input
              id="externalAccountingCode"
              name="externalAccountingCode"
              placeholder="Chave do De-Para (Fase 2)"
              defaultValue={spe.externalAccountingCode ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="chartOfAccountsRef">Plano de contas — código de referência</label>
            <input
              id="chartOfAccountsRef"
              name="chartOfAccountsRef"
              placeholder="Outra chave do De-Para (Fase 2)"
              defaultValue={spe.chartOfAccountsRef ?? ""}
            />
          </div>
        </div>
      </div>

      <div className="field-section">
        <h3>Obrigações</h3>
        <div className="field-grid">
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <input type="checkbox" name="dimobRequired" defaultChecked={spe.dimobRequired} />
              Entrega DIMOB
            </label>
          </div>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <input type="checkbox" name="efdContributionsRequired" defaultChecked={spe.efdContributionsRequired} />
              EFD-Contribuições
            </label>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="accountingNotes">Observações contábeis</label>
            <input id="accountingNotes" name="accountingNotes" defaultValue={spe.accountingNotes ?? ""} />
          </div>
        </div>
      </div>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      <button type="button" disabled={pending} onClick={() => formRef.current?.requestSubmit()} style={{ marginTop: "0.75rem" }}>
        {pending ? "Salvando..." : "Salvar dados contábeis"}
      </button>
    </form>
  );
}

const LAND_ACQUISITION_METHOD_LABELS: Record<string, string> = {
  PURCHASE: "Compra",
  PHYSICAL_EXCHANGE: "Permuta física",
  FINANCIAL_EXCHANGE: "Permuta financeira",
  CAPITAL_CONTRIBUTION: "Integralização",
  OTHER: "Outro",
};

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
                      ? formatCalendarDateBR(doc.expiresAt) + (expired ? " (vencida)" : "")
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
                <td>{partner.startDate ? formatCalendarDateBR(partner.startDate) : "—"}</td>
                <td>{partner.endDate ? formatCalendarDateBR(partner.endDate) : "—"}</td>
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
  const [modality, setModality] = useState(investor?.modality ?? "EQUITY");
  const [indexRules, setIndexRules] = useState<Awaited<ReturnType<typeof getIndexRulesAction>>>([]);

  useEffect(() => {
    getIndexRulesAction().then(setIndexRules);
  }, []);

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
          <select
            id="investor-modality"
            name="modality"
            required
            value={modality}
            onChange={(e) => setModality(e.target.value as typeof modality)}
          >
            <option value="EQUITY">Equity (participação)</option>
            <option value="LOAN">Mútuo</option>
            <option value="PHYSICAL_EXCHANGE">Permuta física</option>
            <option value="FINANCIAL_EXCHANGE">Permuta financeira</option>
            <option value="OTHER">Outro</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="investor-capital">Capital aportado (R$) — legado</label>
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
          <label htmlFor="investor-committed-capital">Capital comprometido total (R$)</label>
          <input
            id="investor-committed-capital"
            name="committedCapital"
            type="number"
            step="0.01"
            min="0"
            placeholder="Deixe em branco se não houver teto definido"
            defaultValue={investor?.committedCapital ?? ""}
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

      <h4 style={{ marginTop: "1rem" }}>Conta bancária de devolução</h4>
      <p className="field-hint">Para onde vão distribuições e devoluções — conta externa do investidor, não do cadastro central.</p>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="investor-return-bank-name">Banco</label>
          <input id="investor-return-bank-name" name="returnBankName" defaultValue={investor?.returnBankName ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="investor-return-bank-agency">Agência</label>
          <input
            id="investor-return-bank-agency"
            name="returnBankAgency"
            defaultValue={investor?.returnBankAgency ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="investor-return-bank-account">Conta</label>
          <input
            id="investor-return-bank-account"
            name="returnBankAccount"
            defaultValue={investor?.returnBankAccount ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="investor-return-pix-type">Tipo de chave Pix</label>
          <input
            id="investor-return-pix-type"
            name="returnPixKeyType"
            placeholder="CPF/CNPJ/e-mail/telefone/aleatória"
            defaultValue={investor?.returnPixKeyType ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="investor-return-pix-value">Chave Pix</label>
          <input
            id="investor-return-pix-value"
            name="returnPixKeyValue"
            defaultValue={investor?.returnPixKeyValue ?? ""}
          />
        </div>
      </div>

      {modality === "LOAN" ? (
        <>
          <h4 style={{ marginTop: "1rem" }}>Condições do mútuo</h4>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="investor-loan-rate">Taxa de juros (%)</label>
              <input
                id="investor-loan-rate"
                name="loanInterestRate"
                type="number"
                step="0.001"
                min="0"
                defaultValue={investor?.loanInterestRate ?? ""}
              />
            </div>
            <div className="field">
              <label htmlFor="investor-loan-period">Periodicidade</label>
              <select id="investor-loan-period" name="loanInterestPeriod" defaultValue={investor?.loanInterestPeriod ?? ""}>
                <option value="">—</option>
                <option value="MONTHLY">% ao mês</option>
                <option value="YEARLY">% ao ano</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="investor-loan-index">Correção por índice</label>
              <select id="investor-loan-index" name="loanIndexRuleId" defaultValue={investor?.loanIndexRuleId ?? ""}>
                <option value="">Sem correção</option>
                {indexRules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="investor-loan-grace">Carência (meses)</label>
              <input
                id="investor-loan-grace"
                name="loanGraceMonths"
                type="number"
                step="1"
                min="0"
                defaultValue={investor?.loanGraceMonths ?? ""}
              />
            </div>
            <div className="field">
              <label htmlFor="investor-loan-term">Prazo (meses)</label>
              <input
                id="investor-loan-term"
                name="loanTermMonths"
                type="number"
                step="1"
                min="1"
                defaultValue={investor?.loanTermMonths ?? ""}
              />
            </div>
          </div>
        </>
      ) : null}

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

function SpeContributionSummaryPanel({ speId, refreshKey }: { speId: string; refreshKey: number }) {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getSpeContributionSummaryAction>>>(null);

  useEffect(() => {
    getSpeContributionSummaryAction(speId).then(setSummary);
  }, [speId, refreshKey]);

  if (!summary) return null;

  const format = formatCurrencyBRL;

  return (
    <div className="field-section" style={{ marginBottom: "1rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
      <div>
        <p className="field-hint">Comprometido</p>
        <strong>
          {format(summary.committed)}
          {summary.hasOpenCommitment ? " +" : ""}
        </strong>
      </div>
      <div>
        <p className="field-hint">Previsto</p>
        <strong>{format(summary.totalForecast)}</strong>
      </div>
      <div>
        <p className="field-hint">Realizado</p>
        <strong>{format(summary.totalRealized)}</strong>
      </div>
      <div>
        <p className="field-hint">% integralizado</p>
        <strong>{summary.integralizedPct !== null ? `${summary.integralizedPct.toFixed(1)}%` : "—"}</strong>
      </div>
    </div>
  );
}

function SpeInvestorsTab({ spe, onRefresh }: { spe: SpeDetail; onRefresh: () => void }) {
  const [editing, setEditing] = useState<SpeInvestorRow | null | "new">(null);
  const [expandedInvestorId, setExpandedInvestorId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);

  function refreshAll() {
    onRefresh();
    setSummaryRefreshKey((k) => k + 1);
  }

  async function handleDelete(investor: SpeInvestorRow) {
    if (!confirm(`Remover o investidor "${investor.name}"?`)) return;
    setDeleteError(null);
    const result = await deleteSpeInvestorAction(spe.id, investor.id);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    refreshAll();
  }

  return (
    <div>
      {deleteError ? <p className="error-text">{deleteError}</p> : null}

      <SpeContributionSummaryPanel speId={spe.id} refreshKey={summaryRefreshKey} />

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
              <th>Comprometido</th>
              <th>% resultado</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {spe.investors.map((investor) => (
              <>
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
                    {investor.committedCapital !== null
                      ? formatCurrencyBRL(investor.committedCapital)
                      : "Sem teto"}
                  </td>
                  <td>
                    {investor.resultParticipationPct !== null
                      ? `${investor.resultParticipationPct.toLocaleString("pt-BR")}%`
                      : "—"}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setExpandedInvestorId(expandedInvestorId === investor.id ? null : investor.id)}
                      >
                        {expandedInvestorId === investor.id ? "Ocultar aportes" : "Aportes"}
                      </button>
                      <button type="button" className="secondary" onClick={() => setEditing(investor)}>
                        Editar
                      </button>
                      <button type="button" className="secondary" onClick={() => handleDelete(investor)}>
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedInvestorId === investor.id ? (
                  <tr key={`${investor.id}-contributions`}>
                    <td colSpan={7}>
                      <InvestorContributionsPanel
                        investorId={investor.id}
                        bankAccountLinks={spe.bankAccountLinks}
                        onChanged={refreshAll}
                      />
                    </td>
                  </tr>
                ) : null}
              </>
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
            refreshAll();
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

const landFormInitialState: FormState = {};

type SpeLandRow = SpeDetail["lands"][number];

function SpeLandForm({
  speId,
  land,
  onSaved,
  onCancel,
}: {
  speId: string;
  land: SpeLandRow | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const formAction = land ? updateSpeLandAction : createSpeLandAction;
  const [state, dispatch, pending] = useActionState(formAction, landFormInitialState);
  const [affectationEstablished, setAffectationEstablished] = useState(land?.affectationEstablished ?? false);

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form ref={formRef} action={dispatch} className="field-section">
      <h3>{land ? "Editar terreno" : "Adicionar terreno"}</h3>
      <input type="hidden" name="speId" value={speId} />
      {land ? <input type="hidden" name="landId" value={land.id} /> : null}

      <h4>Identificação do imóvel</h4>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="land-registration">Matrícula nº *</label>
          <input id="land-registration" name="registrationNumber" required defaultValue={land?.registrationNumber ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="land-registry-office">Cartório de registro *</label>
          <input
            id="land-registry-office"
            name="registryOffice"
            required
            placeholder="Nome / comarca"
            defaultValue={land?.registryOffice ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="land-total-area">Área total (m²) *</label>
          <input
            id="land-total-area"
            name="totalArea"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={land?.totalArea ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="land-municipal-registration">Inscrição municipal / IPTU</label>
          <input
            id="land-municipal-registration"
            name="municipalRegistration"
            defaultValue={land?.municipalRegistration ?? ""}
          />
        </div>
      </div>

      <AddressFields defaultValues={land ?? undefined} idPrefix="land-" />

      <div className="field-section">
        <h4>Aquisição</h4>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="land-acquisition-method">Forma de aquisição</label>
            <select id="land-acquisition-method" name="acquisitionMethod" defaultValue={land?.acquisitionMethod ?? ""}>
              <option value="">—</option>
              <option value="PURCHASE">Compra</option>
              <option value="PHYSICAL_EXCHANGE">Permuta física</option>
              <option value="FINANCIAL_EXCHANGE">Permuta financeira</option>
              <option value="CAPITAL_CONTRIBUTION">Integralização</option>
              <option value="OTHER">Outro</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="land-previous-owner">Vendedor/permutante anterior</label>
            <input id="land-previous-owner" name="previousOwner" defaultValue={land?.previousOwner ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="land-acquisition-value">Valor de aquisição (R$)</label>
            <input
              id="land-acquisition-value"
              name="acquisitionValue"
              type="number"
              step="0.01"
              min="0"
              defaultValue={land?.acquisitionValue ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="land-acquisition-date">Data de aquisição</label>
            <input
              id="land-acquisition-date"
              name="acquisitionDate"
              type="date"
              defaultValue={land?.acquisitionDate ? new Date(land.acquisitionDate).toISOString().slice(0, 10) : ""}
            />
          </div>
        </div>
      </div>

      <div className="field-section">
        <h4>Situação legal</h4>
        <div className="field-grid">
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <input
                type="checkbox"
                name="affectationEstablished"
                checked={affectationEstablished}
                onChange={(e) => setAffectationEstablished(e.target.checked)}
              />
              Patrimônio de afetação constituído?
            </label>
          </div>
          <div className="field">
            <label htmlFor="land-affectation-date">Data da averbação da afetação</label>
            <input
              id="land-affectation-date"
              name="affectationRegisteredAt"
              type="date"
              disabled={!affectationEstablished}
              defaultValue={
                land?.affectationRegisteredAt ? new Date(land.affectationRegisteredAt).toISOString().slice(0, 10) : ""
              }
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="land-encumbrances">Ônus/gravames</label>
            <input
              id="land-encumbrances"
              name="encumbrances"
              placeholder="Hipoteca, alienação fiduciária..."
              defaultValue={land?.encumbrances ?? ""}
            />
          </div>
        </div>
      </div>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button type="button" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
          {pending ? "Salvando..." : "Salvar terreno"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function SpeLandsTab({ spe, onRefresh }: { spe: SpeDetail; onRefresh: () => void }) {
  const [editing, setEditing] = useState<SpeLandRow | null | "new">(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(land: SpeLandRow) {
    if (!confirm(`Remover o terreno matrícula "${land.registrationNumber}"?`)) return;
    setDeleteError(null);
    const result = await deleteSpeLandAction(spe.id, land.id);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    onRefresh();
  }

  return (
    <div>
      {deleteError ? <p className="error-text">{deleteError}</p> : null}

      {spe.lands.length === 0 ? (
        <p className="field-hint">Nenhum terreno cadastrado.</p>
      ) : (
        <table className="data-table" style={{ marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th>Matrícula</th>
              <th>Endereço</th>
              <th>Área (m²)</th>
              <th>Aquisição</th>
              <th>Afetação</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {spe.lands.map((land) => (
              <tr key={land.id}>
                <td>{land.registrationNumber}</td>
                <td>{[land.city, land.state].filter(Boolean).join("/") || "—"}</td>
                <td>{land.totalArea.toLocaleString("pt-BR")}</td>
                <td>{land.acquisitionMethod ? LAND_ACQUISITION_METHOD_LABELS[land.acquisitionMethod] : "—"}</td>
                <td>{land.affectationEstablished ? "Constituída" : "—"}</td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="secondary" onClick={() => setEditing(land)}>
                      Editar
                    </button>
                    <button type="button" className="secondary" onClick={() => handleDelete(land)}>
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
        <SpeLandForm
          key={editing === "new" ? "new" : editing.id}
          speId={spe.id}
          land={editing === "new" ? null : editing}
          onSaved={() => {
            setEditing(null);
            onRefresh();
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" onClick={() => setEditing("new")}>
          + Adicionar terreno
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
    { id: "terrenos", label: "Terrenos" },
    { id: "contabil", label: "Contábil" },
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
          {formatDateTimeBR(spe!.audit.createdAt)}
          {spe!.audit.updatedAt !== spe!.audit.createdAt ? (
            <>
              {" "}
              · Última alteração por {spe!.audit.updatedByName ?? "—"} em{" "}
              {formatDateTimeBR(spe!.audit.updatedAt)}
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

      <div hidden={activeTab !== "terrenos"}>
        {isEditing ? (
          <SpeLandsTab spe={spe!} onRefresh={refreshSpe} />
        ) : (
          <p className="field-hint">Salve os dados da SPE primeiro para cadastrar terrenos.</p>
        )}
      </div>

      <div hidden={activeTab !== "contabil"}>
        {isEditing ? (
          <SpeAccountingTab spe={spe!} onRefresh={refreshSpe} />
        ) : (
          <p className="field-hint">Salve os dados da SPE primeiro para preencher os dados contábeis.</p>
        )}
      </div>
    </Modal>
  );
}
