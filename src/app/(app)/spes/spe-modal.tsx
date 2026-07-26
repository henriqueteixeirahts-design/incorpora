"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Tabs, type TabDef } from "@/components/Tabs";
import { AddressFields } from "@/components/AddressFields";
import { formatCnpj, formatPhone } from "@/lib/br-validation";
import {
  createSpeAction,
  updateSpeAction,
  getSpeDetailAction,
  getActiveBankAccountsAction,
  linkSpeBankAccountAction,
  unlinkSpeBankAccountAction,
  setPrimarySpeBankAccountAction,
  type CreateSpeState,
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
  { id: "socios", label: "Sócios", note: "Quadro societário — etapa 3 do plano de implementação." },
  { id: "investidores", label: "Investidores", note: "Cadastro estruturado de investidores da SPE — etapa 3 do plano." },
  { id: "documentacao", label: "Documentação", note: "Anexos categorizados (contrato social, certidões...) — etapa 4 do plano." },
  { id: "terrenos", label: "Terrenos", note: "Terrenos vinculados à SPE, com situação legal e afetação — etapa 5 do plano." },
  { id: "contabil", label: "Contábil", note: "Regime tributário (inclusive RET) e dados para integração contábil — etapa 6 do plano." },
];

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
    { id: "contas", label: "Contas bancárias" },
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

      <div hidden={activeTab !== "contas"}>
        {isEditing ? (
          <SpeBankAccountsTab spe={spe!} onRefresh={refreshSpe} />
        ) : (
          <p className="field-hint">Salve os dados da SPE primeiro para vincular contas bancárias.</p>
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
