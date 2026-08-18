"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { simulatePaymentFlow } from "@/lib/payment-flow";
import { evaluateProposal, type ProposalEvaluationStatus } from "@/lib/proposal-evaluation";
import { formatCurrencyBRL, formatPercent } from "@/lib/format";
import { createProposalAction, getProposalReferenceDataAction, type FormState } from "./actions";
import type { ProposalReferenceData } from "@/server/proposals";

type Option = { id: string; label: string };

const EVALUATION_LABEL: Record<ProposalEvaluationStatus, string> = {
  APPROVED_AUTO: "Aprovada automaticamente",
  PENDING_ANALYSIS: "Aguardando análise do gestor",
  REJECTED_AUTO: "Reprovada automaticamente",
};

const EVALUATION_PILL_CLASS: Record<ProposalEvaluationStatus, string> = {
  APPROVED_AUTO: "inc-pill--ok",
  PENDING_ANALYSIS: "inc-pill--warn",
  REJECTED_AUTO: "",
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

const initialState: FormState = {};

export function ProposalModal({
  developmentId,
  units,
  customers,
  brokers,
  agencies,
  salesTables,
  defaultUnitId,
  triggerLabel = "Nova proposta",
}: {
  developmentId: string;
  units: Option[];
  customers: Option[];
  brokers: Option[];
  agencies: Option[];
  salesTables: Option[];
  defaultUnitId?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  const [unitId, setUnitId] = useState(defaultUnitId ?? "");
  const [customerId, setCustomerId] = useState("");
  const [salesTableId, setSalesTableId] = useState("");
  const [brokerId, setBrokerId] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [notes, setNotes] = useState("");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [downPaymentPercent, setDownPaymentPercent] = useState(0);
  const [monthlyInstallments, setMonthlyInstallments] = useState(0);
  const [keysInstallmentPercent, setKeysInstallmentPercent] = useState(0);

  const [refData, setRefData] = useState<ProposalReferenceData | null>(null);
  const [refLoading, setRefLoading] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);

  const baseDate = useMemo(() => new Date(), []);
  const [state, dispatch, pending] = useActionState(createProposalAction, initialState);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!open || !unitId) return;
    let cancelled = false;

    async function loadReferenceData() {
      setRefLoading(true);
      setRefError(null);
      const result = await getProposalReferenceDataAction({ developmentId, unitId, salesTableId: salesTableId || undefined });
      if (cancelled) return;
      setRefLoading(false);
      if (result.error || !result.data) {
        setRefError(result.error ?? "Falha ao carregar dados de referência.");
        setRefData(null);
        return;
      }
      setRefData(result.data);
      setDiscountPercent(0);
      setDownPaymentPercent(result.data.standardFlow.downPaymentPercent);
      setMonthlyInstallments(result.data.standardFlow.monthlyInstallments);
      setKeysInstallmentPercent(result.data.standardFlow.keysInstallmentPercent);
    }

    loadReferenceData();
    return () => {
      cancelled = true;
    };
  }, [open, developmentId, unitId, salesTableId]);

  useEffect(() => {
    if (submittedRef.current && !pending && !state.error) {
      setOpen(false);
      submittedRef.current = false;
    }
  }, [pending, state.error]);

  function handleDownPaymentChange(value: number) {
    const next = clampPercent(value);
    setDownPaymentPercent(next);
    setKeysInstallmentPercent((keys) => Math.min(keys, round2(100 - next)));
  }

  function handleKeysChange(value: number) {
    const next = clampPercent(value);
    setKeysInstallmentPercent(Math.min(next, round2(100 - downPaymentPercent)));
  }

  const salePrice = refData ? round2(refData.listPrice * (1 - discountPercent / 100)) : 0;
  const remainingPercent = round2(100 - downPaymentPercent - keysInstallmentPercent);

  const evaluation = useMemo(() => {
    if (!refData) return null;
    const proposedFlow = simulatePaymentFlow({ salePrice, downPaymentPercent, monthlyInstallments, keysInstallmentPercent });
    const standardFlow = simulatePaymentFlow({
      salePrice,
      downPaymentPercent: refData.standardFlow.downPaymentPercent,
      monthlyInstallments: refData.standardFlow.monthlyInstallments,
      keysInstallmentPercent: refData.standardFlow.keysInstallmentPercent,
    });
    const isOffTable =
      downPaymentPercent !== refData.standardFlow.downPaymentPercent ||
      monthlyInstallments !== refData.standardFlow.monthlyInstallments ||
      keysInstallmentPercent !== refData.standardFlow.keysInstallmentPercent;

    return evaluateProposal({
      standardFlow,
      proposedFlow,
      isOffTable,
      baseDate,
      habiteSeDate: refData.habiteSeDate,
      preHabiteSe: refData.preHabiteSe,
      postHabiteSe: refData.postHabiteSe,
      salePrice,
      rule: refData.rule,
    });
  }, [refData, salePrice, downPaymentPercent, monthlyInstallments, keysInstallmentPercent, baseDate]);

  const canSubmit = Boolean(refData) && Boolean(unitId) && Boolean(customerId) && !refLoading && !pending;

  return (
    <>
      <button type="button" className="inc-btn inc-btn--primary" onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>

      {open ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel" style={{ width: 760, maxWidth: "95vw" }}>
            <div className="modal-header">
              <strong>Nova proposta</strong>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>

            <form
              action={dispatch}
              onSubmit={() => {
                submittedRef.current = true;
              }}
            >
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <input type="hidden" name="developmentId" value={developmentId} />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <label className="inc-field">
                    <span className="inc-label">Unidade *</span>
                    <select
                      name="unitId"
                      className="inc-select"
                      required
                      value={unitId}
                      onChange={(e) => setUnitId(e.target.value)}
                    >
                      <option value="" disabled>
                        Selecione...
                      </option>
                      {units.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inc-field">
                    <span className="inc-label">Cliente *</span>
                    <select
                      name="customerId"
                      className="inc-select"
                      required
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                    >
                      <option value="" disabled>
                        Selecione...
                      </option>
                      {customers.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inc-field">
                    <span className="inc-label">Tabela de vendas</span>
                    <select
                      name="salesTableId"
                      className="inc-select"
                      value={salesTableId}
                      onChange={(e) => setSalesTableId(e.target.value)}
                    >
                      <option value="">Nenhuma (usar valor de referência)</option>
                      {salesTables.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inc-field">
                    <span className="inc-label">Desconto (%)</span>
                    <input
                      name="discountPercent"
                      className="inc-input"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(clampPercent(Number(e.target.value)))}
                      required
                    />
                  </label>
                </div>

                {refLoading ? <p style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>Carregando referência da unidade…</p> : null}
                {refError ? <p className="error-text">{refError}</p> : null}

                {refData ? (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "10px 14px",
                        padding: "12px 14px",
                        background: "var(--inc-surface-subtle)",
                        border: "1px solid var(--inc-border-card)",
                        fontSize: "12.5px",
                      }}
                    >
                      <div>
                        <div className="inc-eyebrow">Valor de tabela</div>
                        <div style={{ fontWeight: 600 }}>{formatCurrencyBRL(refData.listPrice)}</div>
                      </div>
                      <div>
                        <div className="inc-eyebrow">Valor da venda (com desconto)</div>
                        <div style={{ fontWeight: 600, color: "var(--inc-brand-azul)" }}>{formatCurrencyBRL(salePrice)}</div>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--inc-brand-azul)", marginBottom: "8px" }}>
                        Fluxo de pagamento
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                        <label className="inc-field">
                          <span className="inc-label">Entrada (%)</span>
                          <input
                            name="proposedDownPaymentPercent"
                            className="inc-input"
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={downPaymentPercent}
                            onChange={(e) => handleDownPaymentChange(Number(e.target.value))}
                          />
                          <span style={{ fontSize: "11.5px", color: "var(--inc-text-soft)" }}>
                            {formatCurrencyBRL(round2((salePrice * downPaymentPercent) / 100))}
                          </span>
                        </label>
                        <label className="inc-field">
                          <span className="inc-label">Parcelas mensais</span>
                          <input
                            name="proposedMonthlyInstallments"
                            className="inc-input"
                            type="number"
                            min={0}
                            step="1"
                            value={monthlyInstallments}
                            onChange={(e) => setMonthlyInstallments(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                          />
                          <span style={{ fontSize: "11.5px", color: "var(--inc-text-soft)" }}>
                            Saldo {formatPercent(remainingPercent)} · {formatCurrencyBRL(round2((salePrice * remainingPercent) / 100))}
                          </span>
                        </label>
                        <label className="inc-field">
                          <span className="inc-label">Chaves (%)</span>
                          <input
                            name="proposedKeysInstallmentPercent"
                            className="inc-input"
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={keysInstallmentPercent}
                            onChange={(e) => handleKeysChange(Number(e.target.value))}
                          />
                          <span style={{ fontSize: "11.5px", color: "var(--inc-text-soft)" }}>
                            {formatCurrencyBRL(round2((salePrice * keysInstallmentPercent) / 100))}
                          </span>
                        </label>
                      </div>
                      <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--inc-text-soft)" }}>
                        Entrada {formatPercent(downPaymentPercent)} + Saldo {formatPercent(remainingPercent)} + Chaves{" "}
                        {formatPercent(keysInstallmentPercent)} = 100% do valor da venda.
                      </div>
                    </div>

                    {evaluation ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "12px 14px",
                          border: "1px solid var(--inc-border-card)",
                        }}
                      >
                        <span className={`inc-pill ${EVALUATION_PILL_CLASS[evaluation.status]}`}>
                          <span className="inc-pill__dot" />
                          {EVALUATION_LABEL[evaluation.status]}
                        </span>
                        <span style={{ fontSize: "12px", color: "var(--inc-text-soft)" }}>{evaluation.reason}</span>
                      </div>
                    ) : null}
                  </>
                ) : null}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <label className="inc-field">
                    <span className="inc-label">Corretor</span>
                    <select name="brokerId" className="inc-select" value={brokerId} onChange={(e) => setBrokerId(e.target.value)}>
                      <option value="">—</option>
                      {brokers.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inc-field">
                    <span className="inc-label">Imobiliária</span>
                    <select name="agencyId" className="inc-select" value={agencyId} onChange={(e) => setAgencyId(e.target.value)}>
                      <option value="">—</option>
                      {agencies.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="inc-field">
                  <span className="inc-label">Observações</span>
                  <textarea
                    name="notes"
                    className="inc-input"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>

                {state.error ? <p className="error-text">{state.error}</p> : null}
              </div>

              <div className="modal-footer">
                <button type="button" className="inc-btn inc-btn--secondary" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="inc-btn inc-btn--primary" disabled={!canSubmit}>
                  {pending ? "Criando..." : "Criar proposta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
