"use client";

import { useActionState, useEffect, useState } from "react";
import {
  getInvestorContributionsDetailAction,
  createContributionForecastAction,
  updateContributionForecastAction,
  cancelContributionForecastAction,
  createContributionAction,
  deleteContributionAction,
  getCapitalCallsAction,
  createCapitalCallAction,
  uploadCapitalCallDocumentAction,
  getCapitalCallDocumentUrlAction,
  getInvestorReturnsAction,
  createInvestorReturnAction,
  getInvestorLoanPositionAction,
  recordInvestorLoanSnapshotAction,
  getInvestorStatementAction,
  type FormState,
} from "./actions";
import { formatCurrencyBRL, formatCalendarDateBR } from "@/lib/format";

type CapitalCall = Awaited<ReturnType<typeof getCapitalCallsAction>>[number];
type InvestorReturn = Awaited<ReturnType<typeof getInvestorReturnsAction>>[number];
type LoanPositionResult = Awaited<ReturnType<typeof getInvestorLoanPositionAction>>;
type LoanPosition = Exclude<LoanPositionResult, null | { error: string }>;
type InvestorStatement = NonNullable<Awaited<ReturnType<typeof getInvestorStatementAction>>>;

const STATEMENT_EVENT_KIND_LABELS: Record<string, string> = {
  FORECAST: "Previsão",
  CAPITAL_CALL: "Chamada de capital",
  CONTRIBUTION: "Aporte",
  RETURN: "Devolução/distribuição",
};

const RETURN_TYPE_LABELS: Record<string, string> = {
  RESULT_DISTRIBUTION: "Distribuição de resultado",
  LOAN_AMORTIZATION: "Amortização de mútuo",
};

const PAYABLE_STATUS_LABELS: Record<string, string> = {
  ENTERED: "Lançada",
  REVIEWED: "Conferida",
  APPROVED: "Aprovada",
  SCHEDULED: "Programada",
  PAID: "Paga",
  RECONCILED: "Conciliada",
  CANCELLED: "Cancelada",
};

const returnFormInitialState: FormState = {};

function InvestorReturnForm({
  investorId,
  loanNetBalance,
  onSaved,
  onCancel,
}: {
  investorId: string;
  loanNetBalance: number | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [state, dispatch, pending] = useActionState(createInvestorReturnAction, returnFormInitialState);

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={dispatch} style={{ marginTop: "0.5rem", marginBottom: "0.75rem" }}>
      <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Registrar devolução/distribuição</div>
      <input type="hidden" name="investorId" value={investorId} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
        <label className="inc-field">
          <span className="inc-label">Tipo *</span>
          <select name="type" className="inc-select" required defaultValue="RESULT_DISTRIBUTION">
            <option value="RESULT_DISTRIBUTION">Distribuição de resultado (equity)</option>
            <option value="LOAN_AMORTIZATION">Amortização de mútuo</option>
          </select>
        </label>
        <label className="inc-field">
          <span className="inc-label">Valor (R$) *</span>
          <input name="amount" type="number" step="0.01" min="0.01" className="inc-input" required />
        </label>
        <label className="inc-field">
          <span className="inc-label">Competência/período de referência *</span>
          <input name="referenceDate" type="date" className="inc-input" required />
        </label>
        <label className="inc-field">
          <span className="inc-label">Vencimento da conta a pagar *</span>
          <input name="dueDate" type="date" className="inc-input" required />
        </label>
        <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
          <span className="inc-label">Observações</span>
          <input name="notes" className="inc-input" />
        </label>
      </div>
      <p className="field-hint">
        Gera uma conta a pagar (fornecedor = investidor) na conta de devolução cadastrada — segue o fluxo de
        aprovação normal em Contas a pagar.
        {loanNetBalance !== null ? (
          <> Saldo devedor atual do mútuo: <strong>{formatCurrency(loanNetBalance)}</strong>.</>
        ) : null}
      </p>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button type="submit" className="inc-btn inc-btn--primary" disabled={pending}>
          {pending ? "Salvando..." : "Registrar"}
        </button>
        <button type="button" className="inc-btn inc-btn--secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function InvestorReturnsSection({
  investorId,
  loanNetBalance,
  onLoanAffectingChange,
}: {
  investorId: string;
  loanNetBalance: number | null;
  onLoanAffectingChange: () => void;
}) {
  const [returns, setReturns] = useState<InvestorReturn[] | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    getInvestorReturnsAction(investorId).then(setReturns);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investorId]);

  return (
    <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
      <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>
        Devoluções e distribuições (docs/ESPEC_APORTES_INVESTIDORES.md, Parte 3)
      </div>
      {!returns ? (
        <p className="field-hint">Carregando...</p>
      ) : returns.length === 0 ? (
        <p className="field-hint">Nenhuma devolução/distribuição registrada.</p>
      ) : (
        <table className="inc-table" style={{ marginBottom: "0.5rem" }}>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Referência</th>
              <th>Status (conta a pagar)</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => (
              <tr key={r.id}>
                <td>{RETURN_TYPE_LABELS[r.type] ?? r.type}</td>
                <td className="is-num">{formatCurrency(Number(r.amount))}</td>
                <td className="is-muted">{formatCalendarDateBR(r.referenceDate)}</td>
                <td>{PAYABLE_STATUS_LABELS[r.payable.status] ?? r.payable.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating ? (
        <InvestorReturnForm
          investorId={investorId}
          loanNetBalance={loanNetBalance}
          onSaved={() => {
            setCreating(false);
            load();
            onLoanAffectingChange();
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button type="button" className="inc-btn inc-btn--secondary" onClick={() => setCreating(true)}>
          + Registrar devolução/distribuição
        </button>
      )}
    </div>
  );
}

function LoanPositionSection({ investorId, onPosition }: { investorId: string; onPosition: (netBalance: number | null) => void }) {
  const [position, setPosition] = useState<LoanPositionResult>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  function load() {
    getInvestorLoanPositionAction(investorId).then((result) => {
      setPosition(result);
      onPosition(result && !("error" in result) ? result.netBalance : null);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investorId]);

  async function handleRecalculate() {
    setRecalculating(true);
    await recordInvestorLoanSnapshotAction(investorId);
    setRecalculating(false);
    load();
  }

  if (!position) return <p className="field-hint">Carregando posição do mútuo...</p>;
  if ("error" in position) {
    return (
      <div style={{ marginBottom: "1.5rem" }}>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Posição do mútuo</div>
        <p className="field-hint">{position.error}</p>
      </div>
    );
  }

  const loanPosition = position as LoanPosition;

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Posição do mútuo</div>
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <div>
          <p className="field-hint" style={{ padding: 0 }}>Principal aportado</p>
          <strong>{formatCurrency(loanPosition.totalPrincipal)}</strong>
        </div>
        <div>
          <p className="field-hint" style={{ padding: 0 }}>Juros acumulados (líquido)</p>
          <strong>{formatCurrency(loanPosition.totalAccruedInterest)}</strong>
        </div>
        <div>
          <p className="field-hint" style={{ padding: 0 }}>Saldo devedor</p>
          <strong>{formatCurrency(loanPosition.netBalance)}</strong>
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={handleRecalculate} disabled={recalculating}>
          {recalculating ? "Recalculando..." : "Recalcular saldo devedor"}
        </button>
        <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={() => setShowDetail((v) => !v)}>
          {showDetail ? "Ocultar memória de cálculo" : "Ver memória de cálculo"}
        </button>
      </div>
      {showDetail ? (
        <table className="inc-table" style={{ marginBottom: "0.5rem" }}>
          <thead>
            <tr>
              <th>Tranche (aporte)</th>
              <th>Principal</th>
              <th>Juros acumulados</th>
              <th>Amortizado (juros)</th>
              <th>Amortizado (principal)</th>
              <th>Saldo líquido</th>
              <th>Meses de índice faltando</th>
            </tr>
          </thead>
          <tbody>
            {loanPosition.tranches.map((t) => (
              <tr key={t.id}>
                <td className="is-muted">{t.id.slice(0, 8)}</td>
                <td className="is-num">{formatCurrency(t.principal)}</td>
                <td className="is-num">{formatCurrency(t.accruedInterest)}</td>
                <td className="is-num">{formatCurrency(t.amortizedInterest)}</td>
                <td className="is-num">{formatCurrency(t.amortizedPrincipal)}</td>
                <td className="is-num">{formatCurrency(t.netBalance)}</td>
                <td>{t.segments.flatMap((s) => s.missingMonths).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

const CAPITAL_CALL_STATUS_LABELS: Record<string, string> = {
  EMITTED: "Emitida",
  PARTIALLY_FULFILLED: "Atendida (parcial)",
  FULFILLED: "Atendida",
  CANCELLED: "Cancelada",
  OVERDUE: "Vencida",
};

const CAPITAL_CALL_STATUS_CHIP: Record<string, string> = {
  EMITTED: "proposta",
  PARTIALLY_FULFILLED: "reserva",
  FULFILLED: "contrato",
  CANCELLED: "permuta",
  OVERDUE: "atraso",
};

const capitalCallFormInitialState: FormState = {};

function CapitalCallForm({ investorId, onSaved, onCancel }: { investorId: string; onSaved: () => void; onCancel: () => void }) {
  const [state, dispatch, pending] = useActionState(createCapitalCallAction, capitalCallFormInitialState);

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={dispatch} style={{ marginTop: "0.5rem", marginBottom: "0.75rem" }}>
      <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Gerar chamada de capital</div>
      <input type="hidden" name="investorId" value={investorId} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
        <label className="inc-field">
          <span className="inc-label">Valor (R$) *</span>
          <input name="amount" type="number" step="0.01" min="0.01" className="inc-input" required />
        </label>
        <label className="inc-field">
          <span className="inc-label">Data prevista do aporte *</span>
          <input name="expectedDate" type="date" className="inc-input" required />
        </label>
        <label className="inc-field">
          <span className="inc-label">Prazo de atendimento *</span>
          <input name="deadlineDate" type="date" className="inc-input" required />
        </label>
        <label className="inc-field">
          <span className="inc-label">Finalidade</span>
          <input name="purpose" className="inc-input" placeholder="Ex.: aquisição de terreno" />
        </label>
        <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
          <span className="inc-label">Observações</span>
          <input name="notes" className="inc-input" />
        </label>
      </div>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button type="submit" className="inc-btn inc-btn--primary" disabled={pending}>
          {pending ? "Salvando..." : "Gerar chamada"}
        </button>
        <button type="button" className="inc-btn inc-btn--secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function CapitalCallRow({ investorId, call, onChanged }: { investorId: string; call: CapitalCall; onChanged: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    formData.set("file", files[0]);
    setUploading(true);
    setError(null);
    const result = await uploadCapitalCallDocumentAction(investorId, call.id, formData);
    setUploading(false);
    if (result.error) setError(result.error);
    else onChanged();
  }

  async function handleView() {
    const result = await getCapitalCallDocumentUrlAction(investorId, call.id);
    if ("error" in result && result.error) setError(result.error);
    else if ("url" in result && result.url) window.open(result.url, "_blank");
  }

  return (
    <tr>
      <td className="is-num">{formatCurrency(call.amount)}</td>
      <td className="is-muted">{formatCalendarDateBR(call.expectedDate)}</td>
      <td className="is-muted">{formatCalendarDateBR(call.deadlineDate)}</td>
      <td>{call.purpose ?? "—"}</td>
      <td>
        <span className={`inc-chip inc-chip--${CAPITAL_CALL_STATUS_CHIP[call.displayStatus] ?? "permuta"}`}>
          {CAPITAL_CALL_STATUS_LABELS[call.displayStatus] ?? call.displayStatus}
        </span>
      </td>
      <td>
        {call.documentPath ? (
          <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={handleView}>
            Ver PDF
          </button>
        ) : (
          <label className="inc-btn inc-btn--secondary inc-btn--sm" style={{ cursor: "pointer" }}>
            {uploading ? "Enviando..." : "Anexar PDF"}
            <input type="file" accept="application/pdf" style={{ display: "none" }} onChange={(e) => handleUpload(e.target.files)} />
          </label>
        )}
        {error ? <p className="error-text" style={{ marginTop: "4px" }}>{error}</p> : null}
      </td>
    </tr>
  );
}

function CapitalCallsSection({ investorId, onChanged }: { investorId: string; onChanged: () => void }) {
  const [calls, setCalls] = useState<CapitalCall[] | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    getCapitalCallsAction(investorId).then(setCalls);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investorId]);

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>
        Chamadas de capital (docs/ESPEC_APORTES_INVESTIDORES.md, Parte 2.2)
      </div>
      {!calls ? (
        <p className="field-hint">Carregando...</p>
      ) : calls.length === 0 ? (
        <p className="field-hint">Nenhuma chamada de capital emitida.</p>
      ) : (
        <table className="inc-table" style={{ marginBottom: "0.5rem" }}>
          <thead>
            <tr>
              <th>Valor</th>
              <th>Data prevista</th>
              <th>Prazo</th>
              <th>Finalidade</th>
              <th>Status</th>
              <th>Documento</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <CapitalCallRow key={call.id} investorId={investorId} call={call} onChanged={load} />
            ))}
          </tbody>
        </table>
      )}

      {creating ? (
        <CapitalCallForm
          investorId={investorId}
          onSaved={() => {
            setCreating(false);
            load();
            onChanged();
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button type="button" className="inc-btn inc-btn--secondary" onClick={() => setCreating(true)}>
          + Gerar chamada de capital
        </button>
      )}
    </div>
  );
}

type Detail = NonNullable<Awaited<ReturnType<typeof getInvestorContributionsDetailAction>>>;
type ForecastRow = Detail["forecasts"][number];
type BankAccountLink = { bankAccountId: string; bankAccount: { id: string; bankName: string; agency: string; account: string } };

const ORIGIN_LABELS: Record<string, string> = {
  CASH_FLOW_PLANNING: "Planejamento de caixa",
  PUNCTUAL_AGREEMENT: "Acordo pontual",
  CAPITAL_CALL: "Chamada de capital",
};

const FORECAST_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Previsto",
  PARTIALLY_FULFILLED: "Parcialmente baixado",
  FULFILLED: "Baixado",
  CANCELLED: "Cancelado",
};

const formatCurrency = formatCurrencyBRL;

const forecastFormInitialState: FormState = {};

function ForecastForm({
  investorId,
  forecast,
  onSaved,
  onCancel,
}: {
  investorId: string;
  forecast: ForecastRow | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const formAction = forecast ? updateContributionForecastAction : createContributionForecastAction;
  const [state, dispatch, pending] = useActionState(formAction, forecastFormInitialState);

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={dispatch} style={{ marginTop: "0.5rem", marginBottom: "0.75rem" }}>
      <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>{forecast ? "Editar previsão" : "Lançar previsão de aporte"}</div>
      <input type="hidden" name="investorId" value={investorId} />
      {forecast ? <input type="hidden" name="forecastId" value={forecast.id} /> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
        <label className="inc-field">
          <span className="inc-label">Valor previsto (R$) *</span>
          <input
            id="forecast-amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            className="inc-input"
            required
            defaultValue={forecast?.amount ?? ""}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Data prevista *</span>
          <input
            id="forecast-date"
            name="expectedDate"
            type="date"
            className="inc-input"
            required
            defaultValue={forecast ? new Date(forecast.expectedDate).toISOString().slice(0, 10) : ""}
          />
        </label>
        <label className="inc-field">
          <span className="inc-label">Origem *</span>
          <select id="forecast-origin" name="origin" className="inc-select" required defaultValue={forecast?.origin ?? "CASH_FLOW_PLANNING"}>
            <option value="CASH_FLOW_PLANNING">Planejamento de caixa</option>
            <option value="PUNCTUAL_AGREEMENT">Acordo pontual</option>
            <option value="CAPITAL_CALL">Chamada de capital</option>
          </select>
        </label>
        <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
          <span className="inc-label">Observações</span>
          <input id="forecast-notes" name="notes" className="inc-input" defaultValue={forecast?.notes ?? ""} />
        </label>
      </div>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button type="submit" className="inc-btn inc-btn--primary" disabled={pending}>
          {pending ? "Salvando..." : "Salvar previsão"}
        </button>
        <button type="button" className="inc-btn inc-btn--secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

const contributionFormInitialState: FormState = {};

function ContributionForm({
  investorId,
  forecasts,
  bankAccountLinks,
  onSaved,
  onCancel,
}: {
  investorId: string;
  forecasts: ForecastRow[];
  bankAccountLinks: BankAccountLink[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [state, dispatch, pending] = useActionState(createContributionAction, contributionFormInitialState);
  const linkableForecasts = forecasts.filter((f) => f.status !== "CANCELLED" && f.status !== "FULFILLED");

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={dispatch} style={{ marginTop: "0.5rem", marginBottom: "0.75rem" }} encType="multipart/form-data">
      <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Registrar aporte realizado</div>
      <input type="hidden" name="investorId" value={investorId} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
        <label className="inc-field">
          <span className="inc-label">Valor (R$) *</span>
          <input id="contribution-amount" name="amount" type="number" step="0.01" min="0.01" className="inc-input" required />
        </label>
        <label className="inc-field">
          <span className="inc-label">Data do crédito *</span>
          <input id="contribution-date" name="creditDate" type="date" className="inc-input" required />
        </label>
        <label className="inc-field">
          <span className="inc-label">Conta da SPE que recebeu *</span>
          <select id="contribution-account" name="bankAccountId" className="inc-select" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            {bankAccountLinks.map((link) => (
              <option key={link.bankAccountId} value={link.bankAccountId}>
                {link.bankAccount.bankName} — ag. {link.bankAccount.agency} / cc {link.bankAccount.account}
              </option>
            ))}
          </select>
        </label>
        <label className="inc-field">
          <span className="inc-label">Forma</span>
          <input id="contribution-method" name="method" className="inc-input" placeholder="TED/Pix/outro" />
        </label>
        <label className="inc-field">
          <span className="inc-label">Vínculo com previsão</span>
          <select id="contribution-forecast" name="forecastId" className="inc-select" defaultValue="">
            <option value="">Sem vínculo (espontâneo)</option>
            {linkableForecasts.map((f) => (
              <option key={f.id} value={f.id}>
                {formatCurrency(f.amount)} — {formatCalendarDateBR(f.expectedDate)} (
                {ORIGIN_LABELS[f.origin]})
              </option>
            ))}
          </select>
        </label>
        <label className="inc-field">
          <span className="inc-label">Comprovante</span>
          <input id="contribution-receipt" name="receiptFile" type="file" className="inc-input" />
        </label>
        <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
          <span className="inc-label">Observações</span>
          <input id="contribution-notes" name="notes" className="inc-input" />
        </label>
      </div>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button type="submit" className="inc-btn inc-btn--primary" disabled={pending}>
          {pending ? "Salvando..." : "Registrar aporte"}
        </button>
        <button type="button" className="inc-btn inc-btn--secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function InvestorStatementSection({ investorId }: { investorId: string }) {
  const [statement, setStatement] = useState<InvestorStatement | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  useEffect(() => {
    getInvestorStatementAction(investorId).then(setStatement);
  }, [investorId]);

  if (!statement) return null;

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>
        Extrato do investidor (docs/ESPEC_APORTES_INVESTIDORES.md, Parte 4)
      </div>
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <div>
          <p className="field-hint" style={{ padding: 0 }}>Total aportado</p>
          <strong>{formatCurrency(statement.summary.totalContributed)}</strong>
        </div>
        <div>
          <p className="field-hint" style={{ padding: 0 }}>Total devolvido/distribuído</p>
          <strong>{formatCurrency(statement.summary.totalReturned)}</strong>
        </div>
        <div>
          <p className="field-hint" style={{ padding: 0 }}>Posição líquida</p>
          <strong>{formatCurrency(statement.summary.netPosition)}</strong>
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <a
          className="inc-btn inc-btn--secondary inc-btn--sm"
          href={`/api/spes/investor-statement?investorId=${investorId}`}
          target="_blank"
          rel="noreferrer"
        >
          Baixar extrato (PDF)
        </a>
        <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={() => setShowTimeline((v) => !v)}>
          {showTimeline ? "Ocultar linha do tempo" : "Ver linha do tempo"}
        </button>
      </div>
      {showTimeline ? (
        statement.events.length === 0 ? (
          <p className="field-hint">Nenhum evento registrado.</p>
        ) : (
          <table className="inc-table" style={{ marginBottom: "0.5rem" }}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {statement.events.map((e, i) => (
                <tr key={i}>
                  <td className="is-muted">{formatCalendarDateBR(e.date)}</td>
                  <td>{STATEMENT_EVENT_KIND_LABELS[e.kind] ?? e.kind}</td>
                  <td>{e.label}</td>
                  <td className="is-num">{formatCurrency(e.amount)}</td>
                  <td>{e.statusLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}
    </div>
  );
}

export function InvestorContributionsPanel({
  investorId,
  modality,
  bankAccountLinks,
  onChanged,
}: {
  investorId: string;
  modality: string;
  bankAccountLinks: BankAccountLink[];
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [editingForecast, setEditingForecast] = useState<ForecastRow | null | "new">(null);
  const [addingContribution, setAddingContribution] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loanNetBalance, setLoanNetBalance] = useState<number | null>(null);
  const [loanRefreshKey, setLoanRefreshKey] = useState(0);

  function load() {
    getInvestorContributionsDetailAction(investorId).then(setDetail);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investorId]);

  function refresh() {
    load();
    onChanged();
  }

  async function handleCancelForecast(forecast: ForecastRow) {
    const reason = prompt(`Motivo do cancelamento da previsão de ${formatCurrency(forecast.amount)}:`);
    if (reason === null) return;
    setError(null);
    const result = await cancelContributionForecastAction(investorId, forecast.id, reason);
    if (result.error) {
      setError(result.error);
      return;
    }
    refresh();
  }

  async function handleDeleteContribution(contributionId: string) {
    if (!confirm("Remover este aporte registrado?")) return;
    setError(null);
    const result = await deleteContributionAction(investorId, contributionId);
    if (result.error) {
      setError(result.error);
      return;
    }
    refresh();
  }

  if (!detail) return <p className="field-hint">Carregando aportes...</p>;

  return (
    <div style={{ padding: "0.75rem 0" }}>
      {error ? <p className="error-text">{error}</p> : null}

      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div>
          <p className="field-hint" style={{ padding: 0 }}>Comprometido</p>
          <strong>{detail.summary.committed !== null ? formatCurrency(detail.summary.committed) : "Sem teto"}</strong>
        </div>
        <div>
          <p className="field-hint" style={{ padding: 0 }}>Previsto</p>
          <strong>{formatCurrency(detail.summary.totalForecast)}</strong>
        </div>
        <div>
          <p className="field-hint" style={{ padding: 0 }}>Realizado</p>
          <strong>{formatCurrency(detail.summary.totalRealized)}</strong>
        </div>
        <div>
          <p className="field-hint" style={{ padding: 0 }}>% integralizado</p>
          <strong>
            {detail.summary.integralizedPct !== null ? `${detail.summary.integralizedPct.toFixed(1)}%` : "—"}
          </strong>
        </div>
      </div>

      <InvestorStatementSection investorId={investorId} />

      {modality === "LOAN" ? (
        <LoanPositionSection key={loanRefreshKey} investorId={investorId} onPosition={setLoanNetBalance} />
      ) : null}

      <CapitalCallsSection investorId={investorId} onChanged={refresh} />

      <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Previsões</div>
      {detail.forecasts.length === 0 ? (
        <p className="field-hint">Nenhuma previsão lançada.</p>
      ) : (
        <table className="inc-table" style={{ marginBottom: "0.5rem" }}>
          <thead>
            <tr>
              <th>Valor</th>
              <th>Data prevista</th>
              <th>Origem</th>
              <th>Status</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {detail.forecasts.map((f) => (
              <tr key={f.id}>
                <td className="is-num">{formatCurrency(f.amount)}</td>
                <td className="is-muted">{formatCalendarDateBR(f.expectedDate)}</td>
                <td>{ORIGIN_LABELS[f.origin] ?? f.origin}</td>
                <td>{FORECAST_STATUS_LABELS[f.status] ?? f.status}</td>
                <td>
                  {f.status !== "CANCELLED" && f.status !== "FULFILLED" ? (
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={() => setEditingForecast(f)}>
                        Editar
                      </button>
                      <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={() => handleCancelForecast(f)}>
                        Cancelar
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editingForecast ? (
        <ForecastForm
          key={editingForecast === "new" ? "new" : editingForecast.id}
          investorId={investorId}
          forecast={editingForecast === "new" ? null : editingForecast}
          onSaved={() => {
            setEditingForecast(null);
            refresh();
          }}
          onCancel={() => setEditingForecast(null)}
        />
      ) : (
        <button type="button" className="inc-btn inc-btn--secondary" onClick={() => setEditingForecast("new")}>
          + Lançar previsão
        </button>
      )}

      <div className="inc-eyebrow" style={{ marginTop: "1.5rem", marginBottom: "8px" }}>Aportes realizados</div>
      {detail.contributions.length === 0 ? (
        <p className="field-hint">Nenhum aporte registrado.</p>
      ) : (
        <table className="inc-table" style={{ marginBottom: "0.5rem" }}>
          <thead>
            <tr>
              <th>Valor</th>
              <th>Data do crédito</th>
              <th>Conta</th>
              <th>Forma</th>
              <th>Comprovante</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {detail.contributions.map((c) => (
              <tr key={c.id}>
                <td className="is-num">{formatCurrency(c.amount)}</td>
                <td className="is-muted">{formatCalendarDateBR(c.creditDate)}</td>
                <td>
                  {c.bankAccount.bankName} — ag. {c.bankAccount.agency} / cc {c.bankAccount.account}
                </td>
                <td>{c.method ?? "—"}</td>
                <td>
                  {c.receiptSignedUrl ? (
                    <a href={c.receiptSignedUrl} target="_blank" rel="noreferrer">
                      Ver
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={() => handleDeleteContribution(c.id)}>
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {addingContribution ? (
        <ContributionForm
          investorId={investorId}
          forecasts={detail.forecasts}
          bankAccountLinks={bankAccountLinks}
          onSaved={() => {
            setAddingContribution(false);
            refresh();
          }}
          onCancel={() => setAddingContribution(false)}
        />
      ) : (
        <button type="button" className="inc-btn inc-btn--secondary" onClick={() => setAddingContribution(true)}>
          + Registrar aporte
        </button>
      )}

      <InvestorReturnsSection
        investorId={investorId}
        loanNetBalance={loanNetBalance}
        onLoanAffectingChange={() => setLoanRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
