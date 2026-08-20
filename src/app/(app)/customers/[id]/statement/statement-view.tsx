"use client";

import { useActionState, useState } from "react";
import type { CustomerFinancialPosition, ContractStatement, InstallmentStatementRow } from "@/server/customer-statement";
import {
  registerStatementPaymentAction,
  simulateFullSettlementAction,
  generateStatementPdfAction,
  logCollectionContactAction,
  type FormState,
  type SettlementState,
  type GenerateStatementState,
  type LogContactState,
} from "./actions";
import { RenegotiationSection, type RenegotiationRow, type OpenInstallmentOption } from "./renegotiation-forms";
import { formatCalendarDateBR, formatCurrencyBRL } from "@/lib/format";
import { isDraftTemplateName } from "@/lib/document-template-draft";

const registerInitialState: FormState = {};
const settlementInitialState: SettlementState = {};
const generateInitialState: GenerateStatementState = {};
const logContactInitialState: LogContactState = {};

export type CollectionHistoryRow = {
  id: string;
  occurredAtLabel: string;
  channel: string;
  summary: string;
  nextStepNote: string | null;
};

export type CollectionStageInfo = {
  worstDaysOverdue: number;
  currentStep: { offsetDays: number; actionLabel: string } | null;
  nextStep: { offsetDays: number; actionLabel: string } | null;
} | null;

function stepLabel(step: { offsetDays: number; actionLabel: string } | null) {
  if (!step) return "—";
  const dayLabel = step.offsetDays < 0 ? `D${step.offsetDays}` : `D+${step.offsetDays}`;
  return `${dayLabel} — ${step.actionLabel}`;
}

const formatCurrency = formatCurrencyBRL;
const formatDate = formatCalendarDateBR;

function installmentChipClass(status: string) {
  switch (status) {
    case "PAID":
      return "inc-chip inc-chip--contrato";
    case "OVERDUE":
      return "inc-chip inc-chip--atraso";
    case "CANCELLED":
      return "inc-chip inc-chip--permuta";
    default:
      return "inc-chip inc-chip--proposta";
  }
}

function RegisterPaymentForm({ customerId, installmentId }: { customerId: string; installmentId: string }) {
  const [state, formAction, pending] = useActionState(registerStatementPaymentAction, registerInitialState);
  return (
    <form action={formAction} style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", padding: "10px 0" }}>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="installmentId" value={installmentId} />
      <input className="inc-input" name="amount" type="number" step="0.01" placeholder="Valor" required style={{ width: 110 }} />
      <input className="inc-input" name="paidAt" type="date" required />
      <input className="inc-input" name="method" placeholder="PIX/Boleto..." style={{ width: 130 }} />
      <button type="submit" className="inc-btn inc-btn--primary inc-btn--sm" disabled={pending}>
        {pending ? "..." : "Registrar"}
      </button>
      {state.error ? <span className="error-text">{state.error}</span> : null}
    </form>
  );
}

function InstallmentRow({
  installment,
  customerId,
  canRegisterPayment,
}: {
  installment: InstallmentStatementRow;
  customerId: string;
  canRegisterPayment: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isOpen = installment.status !== "PAID" && installment.status !== "CANCELLED";

  return (
    <>
      <tr>
        <td className="is-muted">{installment.sequence}</td>
        <td className="is-key">{installment.isDownPayment ? `${installment.label} (entrada)` : installment.label}</td>
        <td className="is-muted">{formatDate(installment.dueDate)}</td>
        <td className="is-num">{formatCurrency(installment.originalValue)}</td>
        <td className="is-num is-strong">{formatCurrency(installment.resultValue)}</td>
        <td>
          <span className={installmentChipClass(installment.status)}>{installment.situationLabel}</span>
          {installment.renegotiatedByAmendmentNumber ? (
            <div className="inc-table__sub">{installment.renegotiatedByAmendmentNumber}</div>
          ) : null}
        </td>
        <td style={{ fontSize: "var(--inc-fs-xs)" }}>
          {installment.payments.length === 0 ? (
            <span className="is-empty">—</span>
          ) : (
            installment.payments.map((p) => (
              <div key={p.id}>
                {formatDate(p.paidAt)} — {formatCurrency(p.amount)}
                {p.method ? ` — ${p.method}` : ""}
              </div>
            ))
          )}
        </td>
        <td>
          <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Ocultar cálculo" : "Detalhe do cálculo"}
          </button>
        </td>
      </tr>
      {isOpen && canRegisterPayment ? (
        <tr>
          <td colSpan={8} style={{ borderBottom: "1px solid var(--inc-border-row)" }}>
            <RegisterPaymentForm customerId={customerId} installmentId={installment.id} />
          </td>
        </tr>
      ) : null}
      {expanded ? (
        <tr>
          <td colSpan={8} style={{ background: "var(--inc-surface-subtle)" }}>
            {installment.details ? (
              <div style={{ fontSize: "var(--inc-fs-xs)", padding: "10px 0", color: "var(--inc-text-secondary)" }}>
                {installment.details.phases.map((phase, index) => (
                  <p key={index}>
                    <strong>{phase.phase === "PRE_HABITE_SE" ? "Fase de obra" : "Pós-Habite-se"}</strong> — índice acumulado{" "}
                    {((phase.factor - 1) * 100).toFixed(4)}% ({phase.monthsApplied.length} mês(es)
                    {phase.monthsApplied.length > 0
                      ? `: ${phase.monthsApplied.map((m) => `${m.referenceMonth} (${m.ratePercent}%)`).join(", ")}`
                      : ""}
                    ) · juros {phase.monthlyInterestPercent}% {phase.interestType === "COMPOUND" ? "compostos" : "simples"}
                    {phase.missingMonths.length > 0 ? ` · meses sem índice cadastrado: ${phase.missingMonths.join(", ")}` : ""}
                  </p>
                ))}
                {installment.daysOverdue > 0 ? (
                  <p>
                    Vencida há {installment.daysOverdue} dia(s) — multa {formatCurrency(installment.fineAmount)} + mora{" "}
                    {formatCurrency(installment.overdueInterestAmount)}
                  </p>
                ) : null}
              </div>
            ) : (
              <p style={{ fontSize: "var(--inc-fs-xs)", padding: "10px 0", color: "var(--inc-text-muted)" }}>
                Parcela cancelada — sem cálculo de correção.
              </p>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function FullSettlementForm({ contractId }: { contractId: string }) {
  const [state, formAction, pending] = useActionState(simulateFullSettlementAction, settlementInitialState);
  return (
    <div style={{ marginTop: "14px" }}>
      <form action={formAction} style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <input type="hidden" name="contractId" value={contractId} />
        <label className="inc-field" htmlFor={`settle-date-${contractId}`}>
          <span className="inc-label">Simular quitação total na data</span>
          <input id={`settle-date-${contractId}`} className="inc-input" name="targetDate" type="date" required />
        </label>
        <button type="submit" className="inc-btn inc-btn--secondary" disabled={pending}>
          {pending ? "Calculando..." : "Simular"}
        </button>
      </form>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.result ? (
        <p style={{ fontSize: "var(--inc-fs-sm)", marginTop: "8px", color: "var(--inc-text-secondary)" }}>
          Quitação em {formatDate(state.result.targetDate)}: <strong>{formatCurrency(state.result.total)}</strong> (
          {state.result.items.length} parcela(s) em aberto)
        </p>
      ) : null}
    </div>
  );
}

function GenerateStatementForm({
  customerId,
  contractId,
  templates,
}: {
  customerId: string;
  contractId: string;
  templates: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(generateStatementPdfAction, generateInitialState);
  const [selectedId, setSelectedId] = useState("");

  if (templates.length === 0) {
    return <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)" }}>Nenhum modelo de extrato ativo pra este empreendimento.</p>;
  }

  const selected = templates.find((t) => t.id === selectedId);
  const selectedIsDraft = selected ? isDraftTemplateName(selected.label) : false;

  return (
    <form action={formAction} style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="contractId" value={contractId} />
      <select
        className="inc-select"
        name="documentTemplateId"
        required
        defaultValue=""
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        <option value="" disabled>
          Selecione o modelo...
        </option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <button type="submit" className="inc-btn inc-btn--secondary" disabled={pending}>
        {pending ? "Gerando..." : "Gerar PDF do extrato"}
      </button>
      {selectedIsDraft ? (
        <p className="error-text" style={{ width: "100%" }}>
          ⚠ Este modelo é um rascunho gerado automaticamente — revise com o jurídico antes de usar o documento gerado como definitivo.
        </p>
      ) : null}
      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? (
        <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-secondary)" }}>Extrato gerado — veja em Documentos, na venda.</p>
      ) : null}
      {state.missing && state.missing.length > 0 ? (
        <p className="error-text" style={{ width: "100%" }}>
          Faltam dados no cadastro pra gerar &quot;{state.missingTemplateName}&quot;: {state.missing.join(", ")}
        </p>
      ) : null}
    </form>
  );
}

function ContractSection({
  customerId,
  contract,
  templates,
  canRegisterPayment,
  canGenerateDocument,
  canEditContract,
  renegotiations,
  renegotiationTemplates,
}: {
  customerId: string;
  contract: ContractStatement;
  templates: { id: string; label: string }[];
  canRegisterPayment: boolean;
  canGenerateDocument: boolean;
  canEditContract: boolean;
  renegotiations: RenegotiationRow[];
  renegotiationTemplates: { id: string; label: string }[];
}) {
  const openInstallments: OpenInstallmentOption[] = contract.installments
    .filter((i) => i.status === "PENDING" || i.status === "OVERDUE")
    .map((i) => ({ id: i.id, label: i.label, dueDateLabel: formatDate(i.dueDate), resultValue: i.resultValue }));
  return (
    <section style={{ marginTop: "28px" }}>
      <div className="inc-card">
        <div className="inc-card__head">
          <div>
            <div className="inc-card__title">
              {contract.contractNumber} — {contract.developmentName} — {contract.unitNumber}
            </div>
            <div className="inc-card__meta">{contract.situationLabel}</div>
          </div>
        </div>

        <div className="inc-card__body">
          <div className="inc-grid-4">
            <div>
              <div className="inc-label">Valor contratado</div>
              <div style={{ marginTop: "4px", fontSize: "var(--inc-fs-md)", fontWeight: "var(--inc-fw-semibold)", color: "var(--inc-brand-azul)" }}>
                {formatCurrency(contract.contractedValue)}
              </div>
            </div>
            <div>
              <div className="inc-label">Total pago</div>
              <div style={{ marginTop: "4px", fontSize: "var(--inc-fs-md)", fontWeight: "var(--inc-fw-semibold)", color: "var(--inc-brand-azul)" }}>
                {formatCurrency(contract.totalPaid)}
              </div>
            </div>
            <div>
              <div className="inc-label">Saldo devedor atual</div>
              <div style={{ marginTop: "4px", fontSize: "var(--inc-fs-md)", fontWeight: "var(--inc-fw-semibold)", color: "var(--inc-brand-azul)" }}>
                {formatCurrency(contract.outstandingBalance)}
              </div>
            </div>
            <div>
              <div className="inc-label">% quitado</div>
              <div style={{ marginTop: "4px", fontSize: "var(--inc-fs-md)", fontWeight: "var(--inc-fw-semibold)", color: "var(--inc-brand-azul)" }}>
                {contract.percentPaid}%
              </div>
            </div>
          </div>
        </div>

        <table className="inc-table" style={{ border: 0 }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Parcela</th>
              <th>Vencimento</th>
              <th className="is-num">Original</th>
              <th className="is-num">Corrigido</th>
              <th>Situação</th>
              <th>Pagamento</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contract.installments.map((installment) => (
              <InstallmentRow
                key={installment.id}
                installment={installment}
                customerId={customerId}
                canRegisterPayment={canRegisterPayment}
              />
            ))}
          </tbody>
        </table>

        <div className="inc-card__body" style={{ display: "flex", flexDirection: "column", gap: "14px", borderTop: "1px solid var(--inc-border-divider)" }}>
          <p style={{ fontSize: "var(--inc-fs-sm)" }}>
            <a href={`/sales?search=${encodeURIComponent(contract.contractNumber)}`}>
              Ver venda (aditivo, cessão, distrato, simular antecipação) →
            </a>
          </p>

          <FullSettlementForm contractId={contract.contractId} />

          {canGenerateDocument ? (
            <div>
              <div className="inc-label" style={{ marginBottom: "6px" }}>Gerar documento</div>
              <GenerateStatementForm customerId={customerId} contractId={contract.contractId} templates={templates} />
            </div>
          ) : null}
        </div>
      </div>

      <RenegotiationSection
        customerId={customerId}
        contractId={contract.contractId}
        agreements={renegotiations}
        openInstallments={openInstallments}
        templates={renegotiationTemplates}
        canEdit={canEditContract}
        canGenerateDocument={canGenerateDocument}
      />
    </section>
  );
}

function LogContactForm({ customerId }: { customerId: string }) {
  const [state, formAction, pending] = useActionState(logCollectionContactAction, logContactInitialState);
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: 420 }}>
      <input type="hidden" name="customerId" value={customerId} />

      <label className="inc-field" htmlFor="cl-date">
        <span className="inc-label">Data do contato</span>
        <input id="cl-date" className="inc-input" name="occurredAt" type="date" required />
      </label>

      <label className="inc-field" htmlFor="cl-channel">
        <span className="inc-label">Canal</span>
        <input id="cl-channel" className="inc-input" name="channel" type="text" placeholder="Ligação, WhatsApp, E-mail..." required />
      </label>

      <label className="inc-field" htmlFor="cl-summary">
        <span className="inc-label">Resumo</span>
        <textarea id="cl-summary" className="inc-input" name="summary" rows={2} required style={{ height: "auto", padding: "8px 12px" }} />
      </label>

      <label className="inc-field" htmlFor="cl-next">
        <span className="inc-label">Próximo passo</span>
        <input id="cl-next" className="inc-input" name="nextStepNote" type="text" />
      </label>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-secondary)" }}>Contato registrado.</p> : null}

      <button type="submit" className="inc-btn inc-btn--primary" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Salvando..." : "Registrar contato"}
      </button>
    </form>
  );
}

function CollectionHistorySection({
  customerId,
  history,
  stage,
  canRegister,
}: {
  customerId: string;
  history: CollectionHistoryRow[];
  stage: CollectionStageInfo;
  canRegister: boolean;
}) {
  return (
    <section style={{ marginTop: "28px" }}>
      <div className="inc-card">
        <div className="inc-card__head">
          <div className="inc-card__title">Histórico de cobrança</div>
        </div>
        <div className="inc-card__body">
          {stage ? (
            <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-secondary)" }}>
              {stage.worstDaysOverdue} dia(s) em atraso (pior parcela) — etapa atual: {stepLabel(stage.currentStep)} ·
              próxima ação sugerida: {stepLabel(stage.nextStep)}
            </p>
          ) : (
            <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)" }}>Sem parcelas em atraso no momento.</p>
          )}

          {history.length === 0 ? (
            <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)", marginTop: "12px" }}>
              Nenhum contato registrado ainda.
            </p>
          ) : (
            <ul style={{ marginTop: "12px", paddingLeft: "18px", fontSize: "var(--inc-fs-sm)", lineHeight: 1.6, color: "var(--inc-text)" }}>
              {history.map((log) => (
                <li key={log.id}>
                  {log.occurredAtLabel} — {log.channel}: {log.summary}
                  {log.nextStepNote ? ` (próximo passo: ${log.nextStepNote})` : ""}
                </li>
              ))}
            </ul>
          )}

          {canRegister ? (
            <div style={{ marginTop: "16px" }}>
              <LogContactForm customerId={customerId} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function StatementView({
  position,
  templatesByDevelopmentId,
  canRegisterPayment,
  canGenerateDocument,
  canEditContract,
  collectionHistory,
  collectionStage,
  renegotiationsByContractId,
  renegotiationTemplatesByDevelopmentId,
}: {
  position: CustomerFinancialPosition;
  templatesByDevelopmentId: Record<string, { id: string; label: string }[]>;
  canRegisterPayment: boolean;
  canGenerateDocument: boolean;
  canEditContract: boolean;
  collectionHistory: CollectionHistoryRow[];
  collectionStage: CollectionStageInfo;
  renegotiationsByContractId: Record<string, RenegotiationRow[]>;
  renegotiationTemplatesByDevelopmentId: Record<string, { id: string; label: string }[]>;
}) {
  return (
    <>
      {position.contracts.length > 1 ? (
        <div className="inc-card">
          <div className="inc-card__head">
            <div className="inc-card__title">Posição consolidada</div>
            <div className="inc-card__meta">{position.contracts.length} contratos</div>
          </div>
          <div className="inc-card__body">
            <div className="inc-grid-4">
              <div>
                <div className="inc-label">Valor contratado</div>
                <div style={{ marginTop: "4px", fontSize: "var(--inc-fs-md)", fontWeight: "var(--inc-fw-semibold)", color: "var(--inc-brand-azul)" }}>
                  {formatCurrency(position.consolidated.contractedValue)}
                </div>
              </div>
              <div>
                <div className="inc-label">Total pago</div>
                <div style={{ marginTop: "4px", fontSize: "var(--inc-fs-md)", fontWeight: "var(--inc-fw-semibold)", color: "var(--inc-brand-azul)" }}>
                  {formatCurrency(position.consolidated.totalPaid)}
                </div>
              </div>
              <div>
                <div className="inc-label">Saldo devedor</div>
                <div style={{ marginTop: "4px", fontSize: "var(--inc-fs-md)", fontWeight: "var(--inc-fw-semibold)", color: "var(--inc-brand-azul)" }}>
                  {formatCurrency(position.consolidated.outstandingBalance)}
                </div>
              </div>
              <div>
                <div className="inc-label">Situação geral</div>
                <div style={{ marginTop: "4px", fontSize: "var(--inc-fs-md)", fontWeight: "var(--inc-fw-semibold)", color: "var(--inc-brand-azul)" }}>
                  {position.consolidated.situationLabel}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {position.contracts.length === 0 ? (
        <p style={{ color: "var(--inc-text-muted)", marginTop: "20px" }}>Nenhum contrato com carteira ainda.</p>
      ) : (
        position.contracts.map((contract) => (
          <ContractSection
            key={contract.contractId}
            customerId={position.customerId}
            contract={contract}
            templates={templatesByDevelopmentId[contract.developmentId] ?? []}
            canRegisterPayment={canRegisterPayment}
            canGenerateDocument={canGenerateDocument}
            canEditContract={canEditContract}
            renegotiations={renegotiationsByContractId[contract.contractId] ?? []}
            renegotiationTemplates={renegotiationTemplatesByDevelopmentId[contract.developmentId] ?? []}
          />
        ))
      )}

      <CollectionHistorySection
        customerId={position.customerId}
        history={collectionHistory}
        stage={collectionStage}
        canRegister={canRegisterPayment}
      />
    </>
  );
}
