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

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function RegisterPaymentForm({ customerId, installmentId }: { customerId: string; installmentId: string }) {
  const [state, formAction, pending] = useActionState(registerStatementPaymentAction, registerInitialState);
  return (
    <form action={formAction} style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="installmentId" value={installmentId} />
      <input name="amount" type="number" step="0.01" placeholder="Valor" required style={{ width: 100 }} />
      <input name="paidAt" type="date" required />
      <input name="method" placeholder="PIX/Boleto..." style={{ width: 110 }} />
      <button type="submit" disabled={pending}>
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
        <td>{installment.sequence}</td>
        <td>{installment.isDownPayment ? `${installment.label} (entrada)` : installment.label}</td>
        <td>{formatDate(installment.dueDate)}</td>
        <td>{formatCurrency(installment.originalValue)}</td>
        <td>{formatCurrency(installment.resultValue)}</td>
        <td>
          {installment.situationLabel}
          {installment.renegotiatedByAmendmentNumber ? ` (${installment.renegotiatedByAmendmentNumber})` : ""}
        </td>
        <td style={{ fontSize: "0.8rem" }}>
          {installment.payments.length === 0
            ? "—"
            : installment.payments.map((p) => (
                <div key={p.id}>
                  {formatDate(p.paidAt)} — {formatCurrency(p.amount)}
                  {p.method ? ` — ${p.method}` : ""}
                </div>
              ))}
        </td>
        <td>
          <button type="button" className="secondary" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Ocultar cálculo" : "Detalhe do cálculo"}
          </button>
        </td>
      </tr>
      {isOpen && canRegisterPayment ? (
        <tr>
          <td colSpan={8}>
            <RegisterPaymentForm customerId={customerId} installmentId={installment.id} />
          </td>
        </tr>
      ) : null}
      {expanded ? (
        <tr>
          <td colSpan={8} style={{ background: "color-mix(in srgb, var(--foreground) 4%, transparent)" }}>
            {installment.details ? (
              <div style={{ fontSize: "0.8rem", padding: "0.5rem 0" }}>
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
              <p style={{ fontSize: "0.8rem", padding: "0.5rem 0", opacity: 0.7 }}>Parcela cancelada — sem cálculo de correção.</p>
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
    <div style={{ marginTop: "0.75rem" }}>
      <form action={formAction} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <input type="hidden" name="contractId" value={contractId} />
        <label htmlFor={`settle-date-${contractId}`} style={{ fontSize: "0.85rem" }}>
          Simular quitação total na data
        </label>
        <input id={`settle-date-${contractId}`} name="targetDate" type="date" required />
        <button type="submit" disabled={pending}>
          {pending ? "Calculando..." : "Simular"}
        </button>
      </form>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.result ? (
        <p style={{ fontSize: "0.85rem", marginTop: "0.4rem" }}>
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

  if (templates.length === 0) {
    return <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>Nenhum modelo de extrato ativo pra este empreendimento.</p>;
  }

  return (
    <form action={formAction} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="contractId" value={contractId} />
      <select name="documentTemplateId" required defaultValue="">
        <option value="" disabled>
          Selecione o modelo...
        </option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending}>
        {pending ? "Gerando..." : "Gerar PDF do extrato"}
      </button>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Extrato gerado — veja em Documentos, na venda.</p> : null}
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
    <section style={{ marginTop: "2rem", borderTop: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)", paddingTop: "1rem" }}>
      <h2 style={{ fontSize: "1.1rem" }}>
        {contract.contractNumber} — {contract.developmentName} — {contract.unitNumber}
      </h2>
      <p style={{ opacity: 0.8 }}>{contract.situationLabel}</p>

      <div className="field-grid" style={{ marginTop: "0.5rem" }}>
        <div>
          <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Valor contratado</p>
          <p>{formatCurrency(contract.contractedValue)}</p>
        </div>
        <div>
          <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Total pago</p>
          <p>{formatCurrency(contract.totalPaid)}</p>
        </div>
        <div>
          <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Saldo devedor atual</p>
          <p>{formatCurrency(contract.outstandingBalance)}</p>
        </div>
        <div>
          <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>% quitado</p>
          <p>{contract.percentPaid}%</p>
        </div>
      </div>

      <table style={{ marginTop: "1rem", width: "100%" }}>
        <thead>
          <tr>
            <th>#</th>
            <th>Parcela</th>
            <th>Vencimento</th>
            <th>Original</th>
            <th>Corrigido</th>
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

      <p style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
        <a href={`/sales?search=${encodeURIComponent(contract.contractNumber)}`}>
          Ver venda (aditivo, cessão, distrato, simular antecipação) →
        </a>
      </p>

      <FullSettlementForm contractId={contract.contractId} />

      {canGenerateDocument ? (
        <div style={{ marginTop: "1rem" }}>
          <p style={{ fontSize: "0.85rem", fontWeight: 500 }}>Gerar documento</p>
          <GenerateStatementForm customerId={customerId} contractId={contract.contractId} templates={templates} />
        </div>
      ) : null}

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
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 420 }}>
      <input type="hidden" name="customerId" value={customerId} />

      <label htmlFor="cl-date">Data do contato</label>
      <input id="cl-date" name="occurredAt" type="date" required />

      <label htmlFor="cl-channel">Canal</label>
      <input id="cl-channel" name="channel" type="text" placeholder="Ligação, WhatsApp, E-mail..." required />

      <label htmlFor="cl-summary">Resumo</label>
      <textarea id="cl-summary" name="summary" rows={2} required />

      <label htmlFor="cl-next">Próximo passo</label>
      <input id="cl-next" name="nextStepNote" type="text" />

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.success ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Contato registrado.</p> : null}

      <button type="submit" disabled={pending}>
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
    <section
      style={{
        marginTop: "2rem",
        borderTop: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
        paddingTop: "1rem",
      }}
    >
      <h2 style={{ fontSize: "1.1rem" }}>Histórico de cobrança</h2>

      {stage ? (
        <p style={{ fontSize: "0.85rem", opacity: 0.8, marginTop: "0.25rem" }}>
          {stage.worstDaysOverdue} dia(s) em atraso (pior parcela) — etapa atual: {stepLabel(stage.currentStep)} ·
          próxima ação sugerida: {stepLabel(stage.nextStep)}
        </p>
      ) : (
        <p style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: "0.25rem" }}>Sem parcelas em atraso no momento.</p>
      )}

      {history.length === 0 ? (
        <p style={{ opacity: 0.7, fontSize: "0.85rem", marginTop: "0.75rem" }}>Nenhum contato registrado ainda.</p>
      ) : (
        <ul style={{ marginTop: "0.75rem", paddingLeft: "1.1rem", fontSize: "0.85rem", lineHeight: 1.6 }}>
          {history.map((log) => (
            <li key={log.id}>
              {log.occurredAtLabel} — {log.channel}: {log.summary}
              {log.nextStepNote ? ` (próximo passo: ${log.nextStepNote})` : ""}
            </li>
          ))}
        </ul>
      )}

      {canRegister ? (
        <div style={{ marginTop: "1rem" }}>
          <LogContactForm customerId={customerId} />
        </div>
      ) : null}
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
        <div className="field-section" style={{ marginTop: "1.5rem", maxWidth: 600 }}>
          <h2 style={{ fontSize: "1.1rem" }}>Posição consolidada ({position.contracts.length} contratos)</h2>
          <div className="field-grid" style={{ marginTop: "0.5rem" }}>
            <div>
              <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Valor contratado</p>
              <p>{formatCurrency(position.consolidated.contractedValue)}</p>
            </div>
            <div>
              <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Total pago</p>
              <p>{formatCurrency(position.consolidated.totalPaid)}</p>
            </div>
            <div>
              <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Saldo devedor</p>
              <p>{formatCurrency(position.consolidated.outstandingBalance)}</p>
            </div>
            <div>
              <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Situação geral</p>
              <p>{position.consolidated.situationLabel}</p>
            </div>
          </div>
        </div>
      ) : null}

      {position.contracts.length === 0 ? (
        <p style={{ opacity: 0.7, marginTop: "1.5rem" }}>Nenhum contrato com carteira ainda.</p>
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
