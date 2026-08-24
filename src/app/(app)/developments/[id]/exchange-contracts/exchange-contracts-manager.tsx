"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  createExchangeContractAction,
  updateExchangeContractAction,
  deleteExchangeContractAction,
  uploadExchangeContractDocumentAction,
  getExchangeRepasseSummaryAction,
  releaseExchangeRetentionAction,
  getExchangeFinancialTermsAction,
  upsertExchangeFinancialTermsAction,
  getApurationPeriodsAction,
  closeApurationPeriodAction,
  getExchangeStatementAction,
  type FormState,
} from "./actions";
import { formatCurrencyBRL, formatCalendarDateBR } from "@/lib/format";

export type ExchangeContractRow = {
  id: string;
  permutanteId: string;
  permutanteName: string;
  type: string;
  appraisalValue: number | null;
  contractDate: Date;
  notes: string | null;
  status: string;
  managedBySystem: boolean | null;
  administrationFeePct: number | null;
  retentionPct: number | null;
  retentionReleaseTrigger: string | null;
  retentionReleaseDate: Date | null;
  landIds: string[];
  landLabels: string[];
  unitCount: number;
  unitNumbers: string[];
  contractDocumentPath: string | null;
};

type Option = { id: string; label: string };

const TYPE_LABELS: Record<string, string> = {
  PHYSICAL: "Física",
  FINANCIAL: "Financeira",
  MIXED: "Mista",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  SETTLED: "Quitado",
  TERMINATED: "Encerrado",
};

const formatCurrency = formatCurrencyBRL;

const initialState: FormState = {};

function ExchangeContractForm({
  developmentId,
  contract,
  permutantes,
  lands,
  onSaved,
  onCancel,
}: {
  developmentId: string;
  contract: ExchangeContractRow | null;
  permutantes: Option[];
  lands: Option[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const formAction = contract ? updateExchangeContractAction : createExchangeContractAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);
  const [type, setType] = useState(contract?.type ?? "PHYSICAL");
  const [managedBySystem, setManagedBySystem] = useState(contract?.managedBySystem ?? true);

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={dispatch} className="field-section" style={{ marginTop: "0.75rem" }}>
      <h3>{contract ? "Editar contrato de permuta" : "Novo contrato de permuta"}</h3>
      <input type="hidden" name="developmentId" value={developmentId} />
      {contract ? <input type="hidden" name="contractId" value={contract.id} /> : null}

      <div className="field-grid">
        <div className="field">
          <label htmlFor="ec-permutante">Permutante *</label>
          <select id="ec-permutante" name="permutanteId" required defaultValue={contract?.permutanteId ?? ""}>
            <option value="" disabled>
              Selecione...
            </option>
            {permutantes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ec-type">Tipo *</label>
          <select
            id="ec-type"
            name="type"
            required
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="PHYSICAL">Física</option>
            <option value="FINANCIAL">Financeira</option>
            <option value="MIXED">Mista</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ec-appraisal">Valor de avaliação do terreno (R$)</label>
          <input
            id="ec-appraisal"
            name="appraisalValue"
            type="number"
            step="0.01"
            min="0"
            defaultValue={contract?.appraisalValue ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="ec-date">Data do contrato *</label>
          <input
            id="ec-date"
            name="contractDate"
            type="date"
            required
            defaultValue={contract ? new Date(contract.contractDate).toISOString().slice(0, 10) : ""}
          />
        </div>
        <div className="field">
          <label htmlFor="ec-status">Status</label>
          <select id="ec-status" name="status" defaultValue={contract?.status ?? "ACTIVE"}>
            <option value="ACTIVE">Ativo</option>
            <option value="SETTLED">Quitado</option>
            <option value="TERMINATED">Encerrado</option>
          </select>
        </div>
        {type !== "FINANCIAL" ? (
          <>
            <div className="field">
              <label htmlFor="ec-managed">Gestão de vendas pelo sistema?</label>
              <select
                id="ec-managed"
                name="managedBySystem"
                value={String(managedBySystem)}
                onChange={(e) => setManagedBySystem(e.target.value === "true")}
              >
                <option value="true">Sim — incorporadora gerencia a venda</option>
                <option value="false">Não — permutante vende por fora</option>
              </select>
            </div>
            {managedBySystem ? (
              <>
                <div className="field">
                  <label htmlFor="ec-fee">Taxa de administração (%)</label>
                  <input
                    id="ec-fee"
                    name="administrationFeePct"
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    defaultValue={contract?.administrationFeePct ?? ""}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ec-retention-pct">Retenção sobre o repasse (%)</label>
                  <input
                    id="ec-retention-pct"
                    name="retentionPct"
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    defaultValue={contract?.retentionPct ?? ""}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ec-retention-trigger">Gatilho de liberação da retenção</label>
                  <select id="ec-retention-trigger" name="retentionReleaseTrigger" defaultValue={contract?.retentionReleaseTrigger ?? ""}>
                    <option value="">—</option>
                    <option value="HABITE_SE">Habite-se</option>
                    <option value="DELIVERY">Entrega das unidades</option>
                    <option value="FIXED_DATE">Data fixa</option>
                    <option value="CONSTRUCTION_PROGRESS">Medição de obra</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ec-retention-date">Data fixa de liberação</label>
                  <input
                    id="ec-retention-date"
                    name="retentionReleaseDate"
                    type="date"
                    defaultValue={contract?.retentionReleaseDate ? new Date(contract.retentionReleaseDate).toISOString().slice(0, 10) : ""}
                  />
                </div>
              </>
            ) : null}
          </>
        ) : null}
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="ec-notes">Observações</label>
          <input id="ec-notes" name="notes" defaultValue={contract?.notes ?? ""} />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Terreno(s) objeto da permuta</label>
          {lands.length === 0 ? (
            <p className="field-hint">Nenhum terreno cadastrado na SPE deste empreendimento.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {lands.map((land) => (
                <label key={land.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    name="landIds"
                    value={land.id}
                    defaultChecked={contract?.landIds.includes(land.id) ?? false}
                  />
                  {land.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar contrato"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function DocumentUpload({ developmentId, contractId }: { developmentId: string; contractId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    setBusy(true);
    const result = await uploadExchangeContractDocumentAction(developmentId, contractId, formData);
    setBusy(false);
    if (result.error) setError(result.error);
    else if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <input ref={fileInputRef} type="file" style={{ fontSize: "0.8rem" }} />
      <button type="button" className="secondary" disabled={busy} onClick={handleUpload}>
        {busy ? "Enviando..." : "Enviar"}
      </button>
      {error ? <span className="error-text">{error}</span> : null}
    </div>
  );
}

const releaseRetentionInitialState: FormState = {};

function ReleaseRetentionForm({
  developmentId,
  contractId,
  available,
  onDone,
}: {
  developmentId: string;
  contractId: string;
  available: number;
  onDone: () => void;
}) {
  const [state, dispatch, pending] = useActionState(releaseExchangeRetentionAction, releaseRetentionInitialState);

  useEffect(() => {
    if (state.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={dispatch} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap", marginTop: "0.5rem" }}>
      <input type="hidden" name="developmentId" value={developmentId} />
      <input type="hidden" name="contractId" value={contractId} />
      <div className="field">
        <label htmlFor={`release-amount-${contractId}`}>Valor a liberar (R$)</label>
        <input id={`release-amount-${contractId}`} name="amount" type="number" step="0.01" min="0.01" max={available} defaultValue={available} />
      </div>
      <div className="field">
        <label htmlFor={`release-date-${contractId}`}>Data</label>
        <input id={`release-date-${contractId}`} name="releaseDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
      </div>
      <div className="field">
        <label htmlFor={`release-notes-${contractId}`}>Observações</label>
        <input id={`release-notes-${contractId}`} name="notes" />
      </div>
      <button type="submit" className="secondary" disabled={pending}>
        {pending ? "Liberando..." : "Liberar retenção"}
      </button>
      {state.error ? <p className="error-text">{state.error}</p> : null}
    </form>
  );
}

function RepasseSummarySection({ developmentId, contractId }: { developmentId: string; contractId: string }) {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getExchangeRepasseSummaryAction>>>(null);
  const [releasing, setReleasing] = useState(false);

  function load() {
    getExchangeRepasseSummaryAction(contractId).then(setSummary);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  if (!summary) return null;

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
        {summary.repasses.length} repasse(s) registrado(s) · saldo retido disponível: {formatCurrency(summary.retentionBalance)}
      </p>
      {summary.retentionBalance > 0 ? (
        releasing ? (
          <ReleaseRetentionForm
            developmentId={developmentId}
            contractId={contractId}
            available={summary.retentionBalance}
            onDone={() => {
              setReleasing(false);
              load();
            }}
          />
        ) : (
          <button type="button" className="secondary" onClick={() => setReleasing(true)}>
            Liberar retenção
          </button>
        )
      ) : null}
    </div>
  );
}

const PERIOD_STATUS_LABELS: Record<string, string> = { OPEN: "Aberto", CLOSED: "Fechado" };

const financialTermsInitialState: FormState = {};

function FinancialTermsForm({
  developmentId,
  contractId,
  terms,
  onSaved,
}: {
  developmentId: string;
  contractId: string;
  terms: Awaited<ReturnType<typeof getExchangeFinancialTermsAction>>;
  onSaved: () => void;
}) {
  const [state, dispatch, pending] = useActionState(upsertExchangeFinancialTermsAction, financialTermsInitialState);
  const [incidenceScope, setIncidenceScope] = useState(terms?.incidenceScope ?? "ALL_UNITS");
  const [payoutFlow, setPayoutFlow] = useState(terms?.payoutFlow ?? "ON_RECEIPT");

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={dispatch} className="field-section" style={{ marginTop: "0.75rem" }}>
      <h4>Condições financeiras</h4>
      <input type="hidden" name="developmentId" value={developmentId} />
      <input type="hidden" name="contractId" value={contractId} />
      <div className="field-grid">
        <div className="field">
          <label htmlFor={`ft-percent-${contractId}`}>Percentual do permutante (%) *</label>
          <input id={`ft-percent-${contractId}`} name="ft-percent" type="number" step="0.001" min="0.001" max="100" defaultValue={terms?.percent ?? ""} required />
        </div>
        <div className="field">
          <label htmlFor={`ft-incidence-${contractId}`}>Incidência</label>
          <select id={`ft-incidence-${contractId}`} name="ft-incidenceScope" value={incidenceScope} onChange={(e) => setIncidenceScope(e.target.value as typeof incidenceScope)}>
            <option value="ALL_UNITS">Todas as unidades</option>
            <option value="VALUE_CAP">Até um valor-teto</option>
          </select>
        </div>
        {incidenceScope === "VALUE_CAP" ? (
          <div className="field">
            <label htmlFor={`ft-cap-${contractId}`}>Valor-teto (R$) *</label>
            <input id={`ft-cap-${contractId}`} name="ft-incidenceCapValue" type="number" step="0.01" min="0.01" defaultValue={terms?.incidenceCapValue ?? ""} />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor={`ft-flow-${contractId}`}>Fluxo de repasse</label>
          <select id={`ft-flow-${contractId}`} name="ft-payoutFlow" value={payoutFlow} onChange={(e) => setPayoutFlow(e.target.value as typeof payoutFlow)}>
            <option value="ON_RECEIPT">Conforme recebimento</option>
            <option value="MONTHLY_CONSOLIDATED">Consolidado mensal</option>
            <option value="MILESTONES">Por marcos (liberação manual)</option>
          </select>
        </div>
        {payoutFlow === "MILESTONES" ? (
          <>
            <div className="field">
              <label htmlFor={`ft-milestone-desc-${contractId}`}>Descrição do marco</label>
              <input id={`ft-milestone-desc-${contractId}`} name="ft-milestoneDescription" defaultValue={terms?.milestoneDescription ?? ""} placeholder="Ex.: 50% das unidades vendidas" />
            </div>
            <div className="field">
              <label htmlFor={`ft-milestone-target-${contractId}`}>% de unidades vendidas alvo</label>
              <input id={`ft-milestone-target-${contractId}`} name="ft-milestoneTarget" type="number" step="0.1" min="0" max="100" defaultValue={terms?.milestoneTargetUnitsSoldPct ?? ""} />
            </div>
          </>
        ) : null}
        <div className="field">
          <label htmlFor={`ft-base-${contractId}`}>Base de cálculo</label>
          <select id={`ft-base-${contractId}`} name="ft-deductionBase" defaultValue={terms?.deductionBase ?? "GROSS"}>
            <option value="GROSS">Bruta (sobre o valor recebido)</option>
            <option value="NET">Líquida de taxa de administração</option>
          </select>
        </div>
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
            <input type="checkbox" name="ft-deductCommission" defaultChecked={terms?.deductCommission ?? false} />
            Descontar comissão (informada manualmente no fechamento do período)
          </label>
        </div>
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
            <input type="checkbox" name="ft-deductTax" defaultChecked={terms?.deductTax ?? false} />
            Descontar imposto (informado manualmente no fechamento do período)
          </label>
        </div>
        <div className="field">
          <label htmlFor={`ft-retention-${contractId}`}>Retenção (%)</label>
          <input id={`ft-retention-${contractId}`} name="ft-retentionPct" type="number" step="0.001" min="0" max="100" defaultValue={terms?.retentionPct ?? ""} />
        </div>
      </div>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <button type="submit" disabled={pending} style={{ marginTop: "0.5rem" }}>
        {pending ? "Salvando..." : "Salvar condições financeiras"}
      </button>
    </form>
  );
}

const closePeriodInitialState: FormState = {};

function CloseApurationPeriodForm({
  developmentId,
  period,
  onDone,
}: {
  developmentId: string;
  period: Awaited<ReturnType<typeof getApurationPeriodsAction>>[number];
  onDone: () => void;
}) {
  const [state, dispatch, pending] = useActionState(closeApurationPeriodAction, closePeriodInitialState);

  useEffect(() => {
    if (state.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={dispatch} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap", marginTop: "0.35rem" }}>
      <input type="hidden" name="developmentId" value={developmentId} />
      <input type="hidden" name="periodId" value={period.id} />
      <div className="field">
        <label htmlFor={`close-commission-${period.id}`}>Comissão do período (R$)</label>
        <input id={`close-commission-${period.id}`} name="commissionDeduction" type="number" step="0.01" min="0" />
      </div>
      <div className="field">
        <label htmlFor={`close-tax-${period.id}`}>Imposto do período (R$)</label>
        <input id={`close-tax-${period.id}`} name="taxDeduction" type="number" step="0.01" min="0" />
      </div>
      <button type="submit" className="secondary" disabled={pending}>
        {pending ? "Fechando..." : "Fechar período"}
      </button>
      {state.error ? <p className="error-text">{state.error}</p> : null}
    </form>
  );
}

function ApurationPeriodsSection({ developmentId, contractId }: { developmentId: string; contractId: string }) {
  const [periods, setPeriods] = useState<Awaited<ReturnType<typeof getApurationPeriodsAction>> | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  function load() {
    getApurationPeriodsAction(contractId).then(setPeriods);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  if (!periods || periods.length === 0) return null;

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>Períodos de apuração</p>
      <table className="inc-table">
        <thead>
          <tr>
            <th>Início</th>
            <th>Status</th>
            <th>Apurado</th>
            <th>Valor a repassar</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.id}>
              <td className="is-muted">{formatCalendarDateBR(p.periodStart)}</td>
              <td>{PERIOD_STATUS_LABELS[p.status] ?? p.status}</td>
              <td className="is-num">{formatCurrency(p.grossAccrued)}</td>
              <td className="is-num">{p.netAmount !== null ? formatCurrency(p.netAmount) : "—"}</td>
              <td>
                {p.status === "OPEN" ? (
                  closingId === p.id ? (
                    <CloseApurationPeriodForm
                      developmentId={developmentId}
                      period={p}
                      onDone={() => {
                        setClosingId(null);
                        load();
                      }}
                    />
                  ) : (
                    <button type="button" className="secondary" onClick={() => setClosingId(p.id)}>
                      Fechar
                    </button>
                  )
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExchangeFinancialSection({ developmentId, contractId }: { developmentId: string; contractId: string }) {
  const [terms, setTerms] = useState<Awaited<ReturnType<typeof getExchangeFinancialTermsAction>>>(null);
  const [loaded, setLoaded] = useState(false);

  function load() {
    getExchangeFinancialTermsAction(contractId).then((t) => {
      setTerms(t);
      setLoaded(true);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  if (!loaded) return null;

  return (
    <div>
      <FinancialTermsForm developmentId={developmentId} contractId={contractId} terms={terms} onSaved={load} />
      {terms ? <ApurationPeriodsSection developmentId={developmentId} contractId={contractId} /> : null}
    </div>
  );
}

function ExchangeStatementSection({ contractId }: { contractId: string }) {
  const [statement, setStatement] = useState<Awaited<ReturnType<typeof getExchangeStatementAction>>>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  useEffect(() => {
    getExchangeStatementAction(contractId).then(setStatement);
  }, [contractId]);

  if (!statement) return null;

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>Extrato do permutante</p>
      <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
        Total repassado: {formatCurrency(statement.summary.totalRepassed)} · Saldo retido: {formatCurrency(statement.summary.retentionBalance)}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.35rem" }}>
        <a
          className="secondary"
          href={`/api/exchange-contracts/statement?exchangeContractId=${contractId}`}
          target="_blank"
          rel="noreferrer"
        >
          Baixar extrato (PDF)
        </a>
        <button type="button" className="secondary" onClick={() => setShowTimeline((v) => !v)}>
          {showTimeline ? "Ocultar linha do tempo" : "Ver linha do tempo"}
        </button>
      </div>
      {showTimeline ? (
        <table className="inc-table" style={{ marginTop: "0.5rem" }}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Evento</th>
              <th>Valor</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {statement.events.map((e, i) => (
              <tr key={i}>
                <td className="is-muted">{formatCalendarDateBR(e.date)}</td>
                <td>{e.label}</td>
                <td className="is-num">{formatCurrency(e.amount)}</td>
                <td>{e.statusLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

export function ExchangeContractsManager({
  developmentId,
  contracts,
  permutantes,
  lands,
  canCreate,
  canEdit,
  canDelete,
}: {
  developmentId: string;
  contracts: ExchangeContractRow[];
  permutantes: Option[];
  lands: Option[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState<ExchangeContractRow | null | "new">(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(contract: ExchangeContractRow) {
    if (!confirm(`Excluir o contrato de permuta com ${contract.permutanteName}?`)) return;
    setError(null);
    const result = await deleteExchangeContractAction(developmentId, contract.id);
    if (result.error) setError(result.error);
  }

  return (
    <div>
      {error ? <p className="error-text">{error}</p> : null}

      {contracts.length === 0 ? (
        <p className="field-hint">Nenhum contrato de permuta cadastrado.</p>
      ) : (
        contracts.map((contract) => (
          <div key={contract.id} className="field-section" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <strong>{contract.permutanteName}</strong>
                <p style={{ fontSize: "0.85rem", opacity: 0.8, marginTop: "0.25rem" }}>
                  {TYPE_LABELS[contract.type] ?? contract.type} · {STATUS_LABELS[contract.status] ?? contract.status} ·{" "}
                  {formatCalendarDateBR(contract.contractDate)}
                  {contract.appraisalValue !== null ? ` · avaliação ${formatCurrency(contract.appraisalValue)}` : ""}
                </p>
                {contract.type !== "FINANCIAL" ? (
                  <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                    {contract.managedBySystem
                      ? `Sob gestão do sistema${contract.administrationFeePct !== null ? ` · taxa de administração ${contract.administrationFeePct}%` : ""}`
                      : "Fora de gestão — permutante vende por fora"}
                  </p>
                ) : null}
                <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                  Terreno(s): {contract.landLabels.join(", ") || "—"}
                </p>
                <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                  {contract.unitCount} unidade(s) destacada(s)
                  {contract.unitCount > 0 ? `: ${contract.unitNumbers.join(", ")}` : ""}
                </p>
                {contract.notes ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>{contract.notes}</p> : null}
              </div>
              {canEdit ? (
                <div className="row-actions">
                  <button type="button" className="secondary" onClick={() => setEditing(contract)}>
                    Editar
                  </button>
                  {canDelete ? (
                    <button type="button" className="secondary" onClick={() => handleDelete(contract)}>
                      Excluir
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {canEdit ? (
              <div style={{ marginTop: "0.75rem" }}>
                <DocumentUpload developmentId={developmentId} contractId={contract.id} />
              </div>
            ) : null}

            {contract.type !== "FINANCIAL" && contract.managedBySystem ? (
              <RepasseSummarySection developmentId={developmentId} contractId={contract.id} />
            ) : null}

            {contract.type !== "PHYSICAL" && canEdit ? (
              <ExchangeFinancialSection developmentId={developmentId} contractId={contract.id} />
            ) : null}

            <ExchangeStatementSection contractId={contract.id} />

            {editing !== "new" && editing?.id === contract.id ? (
              <ExchangeContractForm
                developmentId={developmentId}
                contract={contract}
                permutantes={permutantes}
                lands={lands}
                onSaved={() => setEditing(null)}
                onCancel={() => setEditing(null)}
              />
            ) : null}
          </div>
        ))
      )}

      {editing === "new" ? (
        <ExchangeContractForm
          developmentId={developmentId}
          contract={null}
          permutantes={permutantes}
          lands={lands}
          onSaved={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      ) : canCreate ? (
        <button type="button" onClick={() => setEditing("new")}>
          + Novo contrato de permuta
        </button>
      ) : null}
    </div>
  );
}
