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

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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
    <form action={dispatch} className="field-section" style={{ marginTop: "0.5rem" }}>
      <h4>{forecast ? "Editar previsão" : "Lançar previsão de aporte"}</h4>
      <input type="hidden" name="investorId" value={investorId} />
      {forecast ? <input type="hidden" name="forecastId" value={forecast.id} /> : null}
      <div className="field-grid">
        <div className="field">
          <label htmlFor="forecast-amount">Valor previsto (R$) *</label>
          <input
            id="forecast-amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={forecast?.amount ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="forecast-date">Data prevista *</label>
          <input
            id="forecast-date"
            name="expectedDate"
            type="date"
            required
            defaultValue={forecast ? new Date(forecast.expectedDate).toISOString().slice(0, 10) : ""}
          />
        </div>
        <div className="field">
          <label htmlFor="forecast-origin">Origem *</label>
          <select id="forecast-origin" name="origin" required defaultValue={forecast?.origin ?? "CASH_FLOW_PLANNING"}>
            <option value="CASH_FLOW_PLANNING">Planejamento de caixa</option>
            <option value="PUNCTUAL_AGREEMENT">Acordo pontual</option>
            <option value="CAPITAL_CALL">Chamada de capital</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="forecast-notes">Observações</label>
          <input id="forecast-notes" name="notes" defaultValue={forecast?.notes ?? ""} />
        </div>
      </div>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar previsão"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
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
    <form action={dispatch} className="field-section" style={{ marginTop: "0.5rem" }} encType="multipart/form-data">
      <h4>Registrar aporte realizado</h4>
      <input type="hidden" name="investorId" value={investorId} />
      <div className="field-grid">
        <div className="field">
          <label htmlFor="contribution-amount">Valor (R$) *</label>
          <input id="contribution-amount" name="amount" type="number" step="0.01" min="0.01" required />
        </div>
        <div className="field">
          <label htmlFor="contribution-date">Data do crédito *</label>
          <input id="contribution-date" name="creditDate" type="date" required />
        </div>
        <div className="field">
          <label htmlFor="contribution-account">Conta da SPE que recebeu *</label>
          <select id="contribution-account" name="bankAccountId" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            {bankAccountLinks.map((link) => (
              <option key={link.bankAccountId} value={link.bankAccountId}>
                {link.bankAccount.bankName} — ag. {link.bankAccount.agency} / cc {link.bankAccount.account}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="contribution-method">Forma</label>
          <input id="contribution-method" name="method" placeholder="TED/Pix/outro" />
        </div>
        <div className="field">
          <label htmlFor="contribution-forecast">Vínculo com previsão</label>
          <select id="contribution-forecast" name="forecastId" defaultValue="">
            <option value="">Sem vínculo (espontâneo)</option>
            {linkableForecasts.map((f) => (
              <option key={f.id} value={f.id}>
                {formatCurrency(f.amount)} — {new Date(f.expectedDate).toLocaleDateString("pt-BR")} (
                {ORIGIN_LABELS[f.origin]})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="contribution-receipt">Comprovante</label>
          <input id="contribution-receipt" name="receiptFile" type="file" />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="contribution-notes">Observações</label>
          <input id="contribution-notes" name="notes" />
        </div>
      </div>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Registrar aporte"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
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
          <p className="field-hint">Comprometido</p>
          <strong>{detail.summary.committed !== null ? formatCurrency(detail.summary.committed) : "Sem teto"}</strong>
        </div>
        <div>
          <p className="field-hint">Previsto</p>
          <strong>{formatCurrency(detail.summary.totalForecast)}</strong>
        </div>
        <div>
          <p className="field-hint">Realizado</p>
          <strong>{formatCurrency(detail.summary.totalRealized)}</strong>
        </div>
        <div>
          <p className="field-hint">% integralizado</p>
          <strong>
            {detail.summary.integralizedPct !== null ? `${detail.summary.integralizedPct.toFixed(1)}%` : "—"}
          </strong>
        </div>
      </div>

      <h4>Previsões</h4>
      {detail.forecasts.length === 0 ? (
        <p className="field-hint">Nenhuma previsão lançada.</p>
      ) : (
        <table className="data-table" style={{ marginBottom: "0.5rem" }}>
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
                <td>{formatCurrency(f.amount)}</td>
                <td>{new Date(f.expectedDate).toLocaleDateString("pt-BR")}</td>
                <td>{ORIGIN_LABELS[f.origin] ?? f.origin}</td>
                <td>{FORECAST_STATUS_LABELS[f.status] ?? f.status}</td>
                <td>
                  {f.status !== "CANCELLED" && f.status !== "FULFILLED" ? (
                    <div className="row-actions">
                      <button type="button" className="secondary" onClick={() => setEditingForecast(f)}>
                        Editar
                      </button>
                      <button type="button" className="secondary" onClick={() => handleCancelForecast(f)}>
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
        <button type="button" className="secondary" onClick={() => setEditingForecast("new")}>
          + Lançar previsão
        </button>
      )}

      <h4 style={{ marginTop: "1.5rem" }}>Aportes realizados</h4>
      {detail.contributions.length === 0 ? (
        <p className="field-hint">Nenhum aporte registrado.</p>
      ) : (
        <table className="data-table" style={{ marginBottom: "0.5rem" }}>
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
                <td>{formatCurrency(c.amount)}</td>
                <td>{new Date(c.creditDate).toLocaleDateString("pt-BR")}</td>
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
                  <button type="button" className="secondary" onClick={() => handleDeleteContribution(c.id)}>
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
        <button type="button" className="secondary" onClick={() => setAddingContribution(true)}>
          + Registrar aporte
        </button>
      )}
    </div>
  );
}
