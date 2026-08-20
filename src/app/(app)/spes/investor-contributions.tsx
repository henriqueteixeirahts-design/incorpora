"use client";

import { useActionState, useEffect, useState } from "react";
import {
  getInvestorContributionsDetailAction,
  createContributionForecastAction,
  updateContributionForecastAction,
  cancelContributionForecastAction,
  createContributionAction,
  deleteContributionAction,
  type FormState,
} from "./actions";
import { formatCurrencyBRL, formatCalendarDateBR } from "@/lib/format";

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

export function InvestorContributionsPanel({
  investorId,
  bankAccountLinks,
  onChanged,
}: {
  investorId: string;
  bankAccountLinks: BankAccountLink[];
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [editingForecast, setEditingForecast] = useState<ForecastRow | null | "new">(null);
  const [addingContribution, setAddingContribution] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    </div>
  );
}
