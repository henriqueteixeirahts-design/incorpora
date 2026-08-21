"use client";

import { useActionState, useEffect, useRef, useState, type CSSProperties } from "react";
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

const FIELD_GRID: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" };

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

      <div style={{ marginBottom: "18px" }}>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Regime tributário</div>
        <div style={FIELD_GRID}>
          <label className="inc-field">
            <span className="inc-label">Regime</span>
            <select
              id="taxRegime"
              name="taxRegime"
              className="inc-select"
              value={taxRegime}
              onChange={(e) => setTaxRegime(e.target.value)}
            >
              <option value="">—</option>
              <option value="ACTUAL_PROFIT">Lucro Real</option>
              <option value="PRESUMED_PROFIT">Lucro Presumido</option>
              <option value="SIMPLES_NACIONAL">Simples Nacional</option>
              <option value="RET">RET (Regime Especial de Tributação)</option>
            </select>
          </label>
          <label className="inc-field">
            <span className="inc-label">Optante pelo RET desde</span>
            <input
              id="retOptionSince"
              name="retOptionSince"
              type="date"
              className="inc-input"
              disabled={!isRet}
              defaultValue={spe.retOptionSince ? new Date(spe.retOptionSince).toISOString().slice(0, 10) : ""}
            />
          </label>
          <label className="inc-field">
            <span className="inc-label">CNPJ do evento 109</span>
            <input
              id="event109Cnpj"
              name="event109Cnpj"
              className="inc-input"
              disabled={!isRet}
              placeholder="Inscrição da incorporação afetada"
              defaultValue={spe.event109Cnpj ? formatCnpj(spe.event109Cnpj) : ""}
              onBlur={(e) => {
                if (e.target.value) e.target.value = formatCnpj(e.target.value);
              }}
            />
          </label>
        </div>
      </div>

      <div style={{ marginBottom: "18px" }}>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Escrituração e responsáveis</div>
        <div style={FIELD_GRID}>
          <label className="inc-field">
            <span className="inc-label">Contador responsável</span>
            <input id="accountantName" name="accountantName" className="inc-input" defaultValue={spe.accountantName ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">CRC</span>
            <input id="accountantCrc" name="accountantCrc" className="inc-input" defaultValue={spe.accountantCrc ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">E-mail do contador</span>
            <input id="accountantEmail" name="accountantEmail" type="email" className="inc-input" defaultValue={spe.accountantEmail ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Telefone do contador</span>
            <input
              id="accountantPhone"
              name="accountantPhone"
              className="inc-input"
              defaultValue={spe.accountantPhone ? formatPhone(spe.accountantPhone) : ""}
              onBlur={(e) => {
                if (e.target.value) e.target.value = formatPhone(e.target.value);
              }}
            />
          </label>
          <label className="inc-field">
            <span className="inc-label">Escritório de contabilidade</span>
            <input id="accountingFirm" name="accountingFirm" className="inc-input" defaultValue={spe.accountingFirm ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Código no sistema contábil externo</span>
            <input
              id="externalAccountingCode"
              name="externalAccountingCode"
              className="inc-input"
              placeholder="Chave do De-Para (Fase 2)"
              defaultValue={spe.externalAccountingCode ?? ""}
            />
          </label>
          <label className="inc-field">
            <span className="inc-label">Plano de contas — código de referência</span>
            <input
              id="chartOfAccountsRef"
              name="chartOfAccountsRef"
              className="inc-input"
              placeholder="Outra chave do De-Para (Fase 2)"
              defaultValue={spe.chartOfAccountsRef ?? ""}
            />
          </label>
        </div>
      </div>

      <div style={{ marginBottom: "18px" }}>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Obrigações</div>
        <div style={FIELD_GRID}>
          <label className="inc-field">
            <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "13px" }}>
              <input type="checkbox" name="dimobRequired" defaultChecked={spe.dimobRequired} />
              Entrega DIMOB
            </span>
          </label>
          <label className="inc-field">
            <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "13px" }}>
              <input type="checkbox" name="efdContributionsRequired" defaultChecked={spe.efdContributionsRequired} />
              EFD-Contribuições
            </span>
          </label>
          <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
            <span className="inc-label">Observações contábeis</span>
            <input id="accountingNotes" name="accountingNotes" className="inc-input" defaultValue={spe.accountingNotes ?? ""} />
          </label>
        </div>
      </div>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      <button
        type="button"
        className="inc-btn inc-btn--primary"
        disabled={pending}
        onClick={() => formRef.current?.requestSubmit()}
        style={{ marginTop: "0.75rem" }}
      >
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
        <table className="inc-table" style={{ marginBottom: "16px" }}>
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
                  <td className="is-key">{doc.fileName}</td>
                  <td>{SPE_DOCUMENT_CATEGORY_LABELS[doc.category] ?? doc.category}</td>
                  <td className="is-muted">{doc.description ?? "—"}</td>
                  <td style={expired ? { color: "var(--inc-danger)" } : undefined}>
                    {doc.expiresAt
                      ? formatCalendarDateBR(doc.expiresAt) + (expired ? " (vencida)" : "")
                      : "—"}
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
              );
            })}
          </tbody>
        </table>
      )}

      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Enviar anexo</div>
        <div style={FIELD_GRID}>
          <label className="inc-field">
            <span className="inc-label">Categoria</span>
            <select id="spe-doc-category" className="inc-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(SPE_DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="inc-field">
            <span className="inc-label">Descrição</span>
            <input
              id="spe-doc-description"
              className="inc-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="inc-field">
            <span className="inc-label">Data de validade</span>
            <input
              id="spe-doc-expires"
              type="date"
              className="inc-input"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </label>
          <label className="inc-field">
            <span className="inc-label">Arquivo</span>
            <input id="spe-doc-file" ref={fileInputRef} type="file" className="inc-input" />
          </label>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <button
          type="button"
          className="inc-btn inc-btn--secondary"
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
    <form ref={formRef} action={dispatch} style={{ marginBottom: "18px" }}>
      <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>{partner ? "Editar sócio" : "Adicionar sócio"}</div>
      <input type="hidden" name="speId" value={speId} />
      {partner ? <input type="hidden" name="partnerId" value={partner.id} /> : null}
      <div style={FIELD_GRID}>
        <label className="inc-field">
          <span className="inc-label">Tipo *</span>
          <select
            id="partner-type"
            name="type"
            className="inc-select"
            required
            value={type}
            onChange={(e) => setType(e.target.value as "INDIVIDUAL" | "COMPANY")}
          >
            <option value="INDIVIDUAL">Pessoa física</option>
            <option value="COMPANY">Pessoa jurídica</option>
          </select>
        </label>
        <label className="inc-field">
          <span className="inc-label">Nome / Razão social *</span>
          <input id="partner-name" name="name" className="inc-input" required defaultValue={partner?.name ?? ""} />
        </label>
        <label className="inc-field">
          <span className="inc-label">{type === "COMPANY" ? "CNPJ *" : "CPF *"}</span>
          <input
            id="partner-document"
            name="document"
            className="inc-input"
            required
            defaultValue={partner ? formatDocument(partner.document, partner.type) : ""}
            onBlur={(e) => {
              e.target.value = formatDocument(e.target.value, type);
            }}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Participação (%) *</span>
          <input
            id="partner-pct"
            name="participationPct"
            type="number"
            step="0.001"
            min="0"
            max="100"
            className="inc-input"
            required
            defaultValue={partner?.participationPct ?? ""}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Papel</span>
          <select id="partner-role" name="role" className="inc-select" defaultValue={partner?.role ?? ""}>
            <option value="">—</option>
            <option value="ADMINISTRATOR">Sócio administrador</option>
            <option value="QUOTAHOLDER">Sócio quotista</option>
            <option value="OTHER">Outro</option>
          </select>
        </label>
        <label className="inc-field">
          <span className="inc-label">Data de entrada</span>
          <input
            id="partner-start"
            name="startDate"
            type="date"
            className="inc-input"
            defaultValue={partner?.startDate ? new Date(partner.startDate).toISOString().slice(0, 10) : ""}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Data de saída</span>
          <input
            id="partner-end"
            name="endDate"
            type="date"
            className="inc-input"
            defaultValue={partner?.endDate ? new Date(partner.endDate).toISOString().slice(0, 10) : ""}
          />
        </label>
      </div>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button type="button" className="inc-btn inc-btn--primary" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
          {pending ? "Salvando..." : "Salvar sócio"}
        </button>
        <button type="button" className="inc-btn inc-btn--secondary" onClick={onCancel}>
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
        <p className="field-hint" style={{ color: "var(--inc-warning-text)" }}>
          Atenção: a soma da participação dos sócios ativos é {total.toLocaleString("pt-BR")}%, diferente de
          100%. Isso é esperado durante uma alteração societária em andamento, mas confira antes de fechar o
          quadro.
        </p>
      ) : null}

      {deleteError ? <p className="error-text">{deleteError}</p> : null}

      {spe.partners.length === 0 ? (
        <p className="field-hint">Nenhum sócio cadastrado.</p>
      ) : (
        <table className="inc-table" style={{ marginBottom: "16px" }}>
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
                <td className="is-key">{partner.name}</td>
                <td className="is-muted">{formatDocument(partner.document, partner.type)}</td>
                <td className="is-num">{partner.participationPct.toLocaleString("pt-BR")}%</td>
                <td>{partner.role ? PARTNER_ROLE_LABELS[partner.role] : "—"}</td>
                <td className="is-muted">{partner.startDate ? formatCalendarDateBR(partner.startDate) : "—"}</td>
                <td className="is-muted">{partner.endDate ? formatCalendarDateBR(partner.endDate) : "—"}</td>
                <td>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={() => setEditing(partner)}>
                      Editar
                    </button>
                    <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={() => handleDelete(partner)}>
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
        <button type="button" className="inc-btn inc-btn--secondary" onClick={() => setEditing("new")}>
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
    <form ref={formRef} action={dispatch} style={{ marginBottom: "18px" }}>
      <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>{investor ? "Editar investidor" : "Adicionar investidor"}</div>
      <input type="hidden" name="speId" value={speId} />
      {investor ? <input type="hidden" name="investorId" value={investor.id} /> : null}
      <div style={FIELD_GRID}>
        <label className="inc-field">
          <span className="inc-label">Tipo *</span>
          <select
            id="investor-type"
            name="type"
            className="inc-select"
            required
            value={type}
            onChange={(e) => setType(e.target.value as "INDIVIDUAL" | "COMPANY")}
          >
            <option value="INDIVIDUAL">Pessoa física</option>
            <option value="COMPANY">Pessoa jurídica</option>
          </select>
        </label>
        <label className="inc-field">
          <span className="inc-label">Nome / Razão social *</span>
          <input id="investor-name" name="name" className="inc-input" required defaultValue={investor?.name ?? ""} />
        </label>
        <label className="inc-field">
          <span className="inc-label">{type === "COMPANY" ? "CNPJ *" : "CPF *"}</span>
          <input
            id="investor-document"
            name="document"
            className="inc-input"
            required
            defaultValue={investor ? formatDocument(investor.document, investor.type) : ""}
            onBlur={(e) => {
              e.target.value = formatDocument(e.target.value, type);
            }}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">E-mail *</span>
          <input id="investor-email" name="email" type="email" className="inc-input" required defaultValue={investor?.email ?? ""} />
        </label>
        <label className="inc-field">
          <span className="inc-label">Telefone *</span>
          <input
            id="investor-phone"
            name="phone"
            className="inc-input"
            required
            defaultValue={investor?.phone ? formatPhone(investor.phone) : ""}
            onBlur={(e) => {
              e.target.value = formatPhone(e.target.value);
            }}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Modalidade *</span>
          <select
            id="investor-modality"
            name="modality"
            className="inc-select"
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
        </label>
        <label className="inc-field">
          <span className="inc-label">Capital aportado (R$) — legado</span>
          <input
            id="investor-capital"
            name="contributedCapital"
            type="number"
            step="0.01"
            min="0"
            className="inc-input"
            defaultValue={investor?.contributedCapital ?? ""}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Capital comprometido total (R$)</span>
          <input
            id="investor-committed-capital"
            name="committedCapital"
            type="number"
            step="0.01"
            min="0"
            className="inc-input"
            placeholder="Deixe em branco se não houver teto definido"
            defaultValue={investor?.committedCapital ?? ""}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Participação no resultado (%)</span>
          <input
            id="investor-result-pct"
            name="resultParticipationPct"
            type="number"
            step="0.001"
            min="0"
            max="100"
            className="inc-input"
            defaultValue={investor?.resultParticipationPct ?? ""}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Data do aporte</span>
          <input
            id="investor-date"
            name="contributionDate"
            type="date"
            className="inc-input"
            defaultValue={
              investor?.contributionDate ? new Date(investor.contributionDate).toISOString().slice(0, 10) : ""
            }
          />
        </label>
        <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
          <span className="inc-label">Observações</span>
          <input id="investor-notes" name="notes" className="inc-input" defaultValue={investor?.notes ?? ""} />
        </label>
      </div>

      <div className="inc-eyebrow" style={{ marginTop: "1rem", marginBottom: "4px" }}>Conta bancária de devolução</div>
      <p className="field-hint" style={{ padding: 0, marginBottom: "8px" }}>
        Para onde vão distribuições e devoluções — conta externa do investidor, não do cadastro central.
      </p>
      <div style={FIELD_GRID}>
        <label className="inc-field">
          <span className="inc-label">Banco</span>
          <input id="investor-return-bank-name" name="returnBankName" className="inc-input" defaultValue={investor?.returnBankName ?? ""} />
        </label>
        <label className="inc-field">
          <span className="inc-label">Agência</span>
          <input
            id="investor-return-bank-agency"
            name="returnBankAgency"
            className="inc-input"
            defaultValue={investor?.returnBankAgency ?? ""}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Conta</span>
          <input
            id="investor-return-bank-account"
            name="returnBankAccount"
            className="inc-input"
            defaultValue={investor?.returnBankAccount ?? ""}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Tipo de chave Pix</span>
          <input
            id="investor-return-pix-type"
            name="returnPixKeyType"
            className="inc-input"
            placeholder="CPF/CNPJ/e-mail/telefone/aleatória"
            defaultValue={investor?.returnPixKeyType ?? ""}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Chave Pix</span>
          <input
            id="investor-return-pix-value"
            name="returnPixKeyValue"
            className="inc-input"
            defaultValue={investor?.returnPixKeyValue ?? ""}
          />
        </label>
      </div>

      {modality === "LOAN" ? (
        <>
          <div className="inc-eyebrow" style={{ marginTop: "1rem", marginBottom: "8px" }}>Condições do mútuo</div>
          <div style={FIELD_GRID}>
            <label className="inc-field">
              <span className="inc-label">Taxa de juros (%)</span>
              <input
                id="investor-loan-rate"
                name="loanInterestRate"
                type="number"
                step="0.001"
                min="0"
                className="inc-input"
                defaultValue={investor?.loanInterestRate ?? ""}
              />
            </label>
            <label className="inc-field">
              <span className="inc-label">Periodicidade</span>
              <select id="investor-loan-period" name="loanInterestPeriod" className="inc-select" defaultValue={investor?.loanInterestPeriod ?? ""}>
                <option value="">—</option>
                <option value="MONTHLY">% ao mês</option>
                <option value="YEARLY">% ao ano</option>
              </select>
            </label>
            <label className="inc-field">
              <span className="inc-label">Tipo de juros</span>
              <select id="investor-loan-interest-type" name="loanInterestType" className="inc-select" defaultValue={investor?.loanInterestType ?? ""}>
                <option value="">—</option>
                <option value="SIMPLE">Simples</option>
                <option value="COMPOUND">Composto</option>
              </select>
            </label>
            <label className="inc-field">
              <span className="inc-label">Correção por índice</span>
              <select id="investor-loan-index" name="loanIndexRuleId" className="inc-select" defaultValue={investor?.loanIndexRuleId ?? ""}>
                <option value="">Sem correção</option>
                {indexRules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="inc-field">
              <span className="inc-label">Carência (meses)</span>
              <input
                id="investor-loan-grace"
                name="loanGraceMonths"
                type="number"
                step="1"
                min="0"
                className="inc-input"
                defaultValue={investor?.loanGraceMonths ?? ""}
              />
            </label>
            <label className="inc-field">
              <span className="inc-label">Prazo (meses)</span>
              <input
                id="investor-loan-term"
                name="loanTermMonths"
                type="number"
                step="1"
                min="1"
                className="inc-input"
                defaultValue={investor?.loanTermMonths ?? ""}
              />
            </label>
          </div>
        </>
      ) : null}

      {state.error ? <p className="error-text">{state.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button type="button" className="inc-btn inc-btn--primary" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
          {pending ? "Salvando..." : "Salvar investidor"}
        </button>
        <button type="button" className="inc-btn inc-btn--secondary" onClick={onCancel}>
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
    <div style={{ marginBottom: "16px", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
      <div>
        <p className="field-hint" style={{ padding: 0 }}>Comprometido</p>
        <strong>
          {format(summary.committed)}
          {summary.hasOpenCommitment ? " +" : ""}
        </strong>
      </div>
      <div>
        <p className="field-hint" style={{ padding: 0 }}>Previsto</p>
        <strong>{format(summary.totalForecast)}</strong>
      </div>
      <div>
        <p className="field-hint" style={{ padding: 0 }}>Realizado</p>
        <strong>{format(summary.totalRealized)}</strong>
      </div>
      <div>
        <p className="field-hint" style={{ padding: 0 }}>% integralizado</p>
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
        <table className="inc-table" style={{ marginBottom: "16px" }}>
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
                  <td className="is-key">{investor.name}</td>
                  <td className="is-muted">{formatDocument(investor.document, investor.type)}</td>
                  <td>
                    {investor.email}
                    <br />
                    {formatPhone(investor.phone)}
                  </td>
                  <td>{INVESTOR_MODALITY_LABELS[investor.modality] ?? investor.modality}</td>
                  <td className="is-num">
                    {investor.committedCapital !== null
                      ? formatCurrencyBRL(investor.committedCapital)
                      : "Sem teto"}
                  </td>
                  <td className="is-num">
                    {investor.resultParticipationPct !== null
                      ? `${investor.resultParticipationPct.toLocaleString("pt-BR")}%`
                      : "—"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="inc-btn inc-btn--secondary inc-btn--sm"
                        onClick={() => setExpandedInvestorId(expandedInvestorId === investor.id ? null : investor.id)}
                      >
                        {expandedInvestorId === investor.id ? "Ocultar aportes" : "Aportes"}
                      </button>
                      <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={() => setEditing(investor)}>
                        Editar
                      </button>
                      <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={() => handleDelete(investor)}>
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
                        modality={investor.modality}
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
        <button type="button" className="inc-btn inc-btn--secondary" onClick={() => setEditing("new")}>
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
    <form ref={formRef} action={dispatch} style={{ marginBottom: "18px" }}>
      <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>{land ? "Editar terreno" : "Adicionar terreno"}</div>
      <input type="hidden" name="speId" value={speId} />
      {land ? <input type="hidden" name="landId" value={land.id} /> : null}

      <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--inc-text-soft)", marginBottom: "8px" }}>Identificação do imóvel</p>
      <div style={FIELD_GRID}>
        <label className="inc-field">
          <span className="inc-label">Matrícula nº *</span>
          <input id="land-registration" name="registrationNumber" className="inc-input" required defaultValue={land?.registrationNumber ?? ""} />
        </label>
        <label className="inc-field">
          <span className="inc-label">Cartório de registro *</span>
          <input
            id="land-registry-office"
            name="registryOffice"
            className="inc-input"
            required
            placeholder="Nome / comarca"
            defaultValue={land?.registryOffice ?? ""}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Área total (m²) *</span>
          <input
            id="land-total-area"
            name="totalArea"
            type="number"
            step="0.01"
            min="0"
            className="inc-input"
            required
            defaultValue={land?.totalArea ?? ""}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Inscrição municipal / IPTU</span>
          <input
            id="land-municipal-registration"
            name="municipalRegistration"
            className="inc-input"
            defaultValue={land?.municipalRegistration ?? ""}
          />
        </label>
      </div>

      <AddressFields defaultValues={land ?? undefined} idPrefix="land-" />

      <div style={{ marginTop: "18px" }}>
        <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--inc-text-soft)", marginBottom: "8px" }}>Aquisição</p>
        <div style={FIELD_GRID}>
          <label className="inc-field">
            <span className="inc-label">Forma de aquisição</span>
            <select id="land-acquisition-method" name="acquisitionMethod" className="inc-select" defaultValue={land?.acquisitionMethod ?? ""}>
              <option value="">—</option>
              <option value="PURCHASE">Compra</option>
              <option value="PHYSICAL_EXCHANGE">Permuta física</option>
              <option value="FINANCIAL_EXCHANGE">Permuta financeira</option>
              <option value="CAPITAL_CONTRIBUTION">Integralização</option>
              <option value="OTHER">Outro</option>
            </select>
          </label>
          <label className="inc-field">
            <span className="inc-label">Vendedor/permutante anterior</span>
            <input id="land-previous-owner" name="previousOwner" className="inc-input" defaultValue={land?.previousOwner ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Valor de aquisição (R$)</span>
            <input
              id="land-acquisition-value"
              name="acquisitionValue"
              type="number"
              step="0.01"
              min="0"
              className="inc-input"
              defaultValue={land?.acquisitionValue ?? ""}
            />
          </label>
          <label className="inc-field">
            <span className="inc-label">Data de aquisição</span>
            <input
              id="land-acquisition-date"
              name="acquisitionDate"
              type="date"
              className="inc-input"
              defaultValue={land?.acquisitionDate ? new Date(land.acquisitionDate).toISOString().slice(0, 10) : ""}
            />
          </label>
        </div>
      </div>

      <div style={{ marginTop: "18px" }}>
        <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--inc-text-soft)", marginBottom: "8px" }}>Situação legal</p>
        <div style={FIELD_GRID}>
          <label className="inc-field">
            <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "13px" }}>
              <input
                type="checkbox"
                name="affectationEstablished"
                checked={affectationEstablished}
                onChange={(e) => setAffectationEstablished(e.target.checked)}
              />
              Patrimônio de afetação constituído?
            </span>
          </label>
          <label className="inc-field">
            <span className="inc-label">Data da averbação da afetação</span>
            <input
              id="land-affectation-date"
              name="affectationRegisteredAt"
              type="date"
              className="inc-input"
              disabled={!affectationEstablished}
              defaultValue={
                land?.affectationRegisteredAt ? new Date(land.affectationRegisteredAt).toISOString().slice(0, 10) : ""
              }
            />
          </label>
          <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
            <span className="inc-label">Ônus/gravames</span>
            <input
              id="land-encumbrances"
              name="encumbrances"
              className="inc-input"
              placeholder="Hipoteca, alienação fiduciária..."
              defaultValue={land?.encumbrances ?? ""}
            />
          </label>
        </div>
      </div>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button type="button" className="inc-btn inc-btn--primary" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
          {pending ? "Salvando..." : "Salvar terreno"}
        </button>
        <button type="button" className="inc-btn inc-btn--secondary" onClick={onCancel}>
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
        <table className="inc-table" style={{ marginBottom: "16px" }}>
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
                <td className="is-key">{land.registrationNumber}</td>
                <td className="is-muted">{[land.city, land.state].filter(Boolean).join("/") || "—"}</td>
                <td className="is-num">{land.totalArea.toLocaleString("pt-BR")}</td>
                <td>{land.acquisitionMethod ? LAND_ACQUISITION_METHOD_LABELS[land.acquisitionMethod] : "—"}</td>
                <td>{land.affectationEstablished ? "Constituída" : "—"}</td>
                <td>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={() => setEditing(land)}>
                      Editar
                    </button>
                    <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={() => handleDelete(land)}>
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
        <button type="button" className="inc-btn inc-btn--secondary" onClick={() => setEditing("new")}>
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
        <table className="inc-table" style={{ marginBottom: "16px" }}>
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
                <td className="is-key">{link.bankAccount.bankName}</td>
                <td className="is-muted">
                  {link.bankAccount.agency} / {link.bankAccount.account}
                </td>
                <td>{BANK_ACCOUNT_TYPE_LABELS[link.bankAccount.type] ?? link.bankAccount.type}</td>
                <td>
                  {link.isPrimary ? (
                    "Principal"
                  ) : (
                    <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={() => handleSetPrimary(link.bankAccountId)}>
                      Tornar principal
                    </button>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="inc-btn inc-btn--secondary inc-btn--sm"
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

      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Vincular conta</div>
        <div style={FIELD_GRID}>
          <label className="inc-field">
            <span className="inc-label">Conta cadastrada</span>
            <select
              id="bank-account-select"
              className="inc-select"
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
          </label>
          <label className="inc-field" style={{ justifyContent: "flex-end" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "13px" }}>
              <input
                type="checkbox"
                checked={markPrimary}
                onChange={(e) => setMarkPrimary(e.target.checked)}
              />
              Definir como principal
            </span>
          </label>
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
        <button type="button" className="inc-btn inc-btn--primary" disabled={pending || !selectedAccountId} onClick={handleLink} style={{ marginTop: "0.75rem" }}>
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
          <button type="button" className="inc-btn inc-btn--secondary" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="inc-btn inc-btn--primary" disabled={pending} onClick={() => dadosFormRef.current?.requestSubmit()}>
            {pending ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      {isEditing && spe!.audit ? (
        <p style={{ marginTop: 0, marginBottom: "12px", fontSize: "12px", color: "var(--inc-text-soft)" }}>
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

          <div style={{ marginBottom: "18px" }}>
            <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Identificação</div>
            <div style={FIELD_GRID}>
              <label className="inc-field">
                <span className="inc-label">Razão social *</span>
                <input id="name" name="name" className="inc-input" required defaultValue={spe?.name ?? ""} />
              </label>
              <label className="inc-field">
                <span className="inc-label">Nome fantasia</span>
                <input id="tradeName" name="tradeName" className="inc-input" defaultValue={spe?.tradeName ?? ""} />
              </label>
              <label className="inc-field">
                <span className="inc-label">CNPJ *</span>
                <input
                  id="document"
                  name="document"
                  ref={documentInputRef}
                  className="inc-input"
                  required
                  placeholder="00.000.000/0000-00"
                  defaultValue={spe ? formatCnpj(spe.document) : ""}
                  onBlur={(e) => {
                    e.target.value = formatCnpj(e.target.value);
                  }}
                />
              </label>
              <label className="inc-field">
                <span className="inc-label">NIRE</span>
                <input id="nire" name="nire" className="inc-input" defaultValue={spe?.nire ?? ""} />
              </label>
              <label className="inc-field">
                <span className="inc-label">Data de constituição</span>
                <input
                  id="foundedAt"
                  name="foundedAt"
                  type="date"
                  className="inc-input"
                  defaultValue={spe?.foundedAt ? new Date(spe.foundedAt).toISOString().slice(0, 10) : ""}
                />
              </label>
              <label className="inc-field">
                <span className="inc-label">Situação *</span>
                <select id="status" name="status" className="inc-select" required defaultValue={spe?.status ?? "ACTIVE"}>
                  <option value="ACTIVE">Ativa</option>
                  <option value="IN_FORMATION">Em constituição</option>
                  <option value="CLOSED">Encerrada</option>
                </select>
              </label>
              <label className="inc-field">
                <span className="inc-label">Natureza jurídica</span>
                <input
                  id="legalNature"
                  name="legalNature"
                  className="inc-input"
                  list="legal-nature-options"
                  defaultValue={spe?.legalNature ?? ""}
                />
                <datalist id="legal-nature-options">
                  {LEGAL_NATURE_SUGGESTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </label>
              <label className="inc-field">
                <span className="inc-label">CNAE principal</span>
                <input
                  id="cnae"
                  name="cnae"
                  className="inc-input"
                  placeholder="41.10-7-00 Incorporação de empreendimentos imobiliários"
                  defaultValue={spe?.cnae ?? ""}
                />
              </label>
            </div>
          </div>

          <div style={{ marginBottom: "18px" }}>
            <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Contato</div>
            <div style={FIELD_GRID}>
              <label className="inc-field">
                <span className="inc-label">E-mail *</span>
                <input id="email" name="email" type="email" className="inc-input" required defaultValue={spe?.email ?? ""} />
              </label>
              <label className="inc-field">
                <span className="inc-label">Telefone *</span>
                <input
                  id="phone"
                  name="phone"
                  ref={phoneInputRef}
                  className="inc-input"
                  required
                  placeholder="(00) 00000-0000"
                  defaultValue={spe?.phone ? formatPhone(spe.phone) : ""}
                  onBlur={(e) => {
                    e.target.value = formatPhone(e.target.value);
                  }}
                />
              </label>
              <label className="inc-field">
                <span className="inc-label">Site</span>
                <input id="website" name="website" className="inc-input" defaultValue={spe?.website ?? ""} />
              </label>
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
                    className="inc-btn inc-btn--secondary inc-btn--sm"
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
