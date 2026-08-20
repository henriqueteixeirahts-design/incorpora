"use client";

import { useState, type ReactNode } from "react";
import { Tabs, type TabDef } from "@/components/Tabs";
import { CreateContractForm, MarkAwaitingSignatureForm, ConfirmSignatureForm } from "./contract-forms";
import { CorrectionRuleForm } from "./correction-rule-form";
import { DownPaymentDestinationForm } from "./down-payment-destination-form";
import { RegisterPaymentForm, RecalculatePortfolioButton } from "./payment-form";
import { AnticipationForm } from "./anticipation-form";
import { GenerateDocumentForm } from "./generate-document-form";
import { NewAmendmentForm, SignAmendmentButton, AmendmentDocumentForm } from "./amendment-forms";
import { NewAssignmentForm, SignAssignmentButton, AssignmentDocumentForm } from "./assignment-forms";
import { NewDistratoForm, SignDistratoButton, DistratoDocumentForm } from "./distrato-forms";
import { formatCurrencyBRL } from "@/lib/format";

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Minuta gerada",
  AWAITING_SIGNATURE: "Aguardando assinatura",
  SIGNED: "Assinado",
  CANCELLED: "Cancelado",
};

const CONTRACT_STATUS_CHIP: Record<string, string> = {
  DRAFT: "inc-chip--proposta",
  AWAITING_SIGNATURE: "inc-chip--reserva",
  SIGNED: "inc-chip--contrato",
  CANCELLED: "inc-chip--atraso",
};

const INSTALLMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "A vencer",
  PARTIALLY_PAID: "Parcialmente paga",
  PAID: "Paga",
  OVERDUE: "Vencida",
  CANCELLED: "Cancelada",
};

const COMMISSION_BENEFICIARY_LABELS: Record<string, string> = {
  BROKER: "Corretor",
  AGENCY: "Imobiliária",
  COORDINATOR: "Coordenador",
  MANAGER: "Gerente",
  CAMPAIGN: "Campanha",
};

const formatCurrency = formatCurrencyBRL;

export type TimelineEventRow = { id: string; label: string; occurredAtLabel: string; actorName: string | null };

export type PaymentFlowItemRow = { label: string; amount: number; dueOffsetMonths: number };

export type InstallmentRow = {
  id: string;
  sequence: number;
  label: string;
  dueDateLabel: string;
  originalValue: number;
  correctedValue: number | null;
  paidAmount: number;
  status: string;
};

export type GeneratedDocumentRow = {
  id: string;
  fileName: string;
  templateVersion: number | null;
  uploadedByName: string;
  createdAtLabel: string;
  downloadUrl: string | null;
};

export type AmendmentRow = {
  id: string;
  amendmentNumber: string;
  type: string;
  status: string;
  notes: string | null;
  createdAtLabel: string;
  signedAtLabel: string | null;
  proposedFlowItems: PaymentFlowItemRow[] | null;
  generatedDocuments: GeneratedDocumentRow[];
};

const COMMISSION_STATUS_LABELS: Record<string, string> = {
  PENDING: "A liberar",
  RELEASED: "Liberada",
  INVOICED: "Faturada",
  PAID: "Paga",
  CANCELLED: "Cancelada",
};

const AMENDMENT_TYPE_LABELS: Record<string, string> = {
  FLOW_RENEGOTIATION: "Renegociação de fluxo",
  UNIT_CHANGE: "Alteração de unidade",
  TERM_CHANGE: "Alteração de prazo",
  OTHER: "Outro",
};

const AMENDMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  SIGNED: "Assinado",
};

const DRAFT_SIGNED_CHIP: Record<string, string> = {
  DRAFT: "inc-chip--proposta",
  SIGNED: "inc-chip--contrato",
};

export type AssignmentRow = {
  id: string;
  assignmentNumber: string;
  status: string;
  notes: string | null;
  assignmentDateLabel: string;
  feeAmount: number | null;
  createdAtLabel: string;
  signedAtLabel: string | null;
  previousCustomerName: string;
  newCustomerName: string;
  generatedDocuments: GeneratedDocumentRow[];
};

const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  SIGNED: "Assinado",
};

export type DistratoRow = {
  id: string;
  distratoNumber: string;
  status: string;
  totalPaid: number;
  retentionPercent: number;
  retentionAmount: number;
  brokerageDeductionAmount: number | null;
  occupancyFeeAmount: number | null;
  refundAmount: number;
  refundDueDateLabel: string;
  refundTerms: string | null;
  reason: string | null;
  createdAtLabel: string;
  signedAtLabel: string | null;
  refundPayableId: string | null;
  generatedDocuments: GeneratedDocumentRow[];
};

const DISTRATO_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  SIGNED: "Assinado",
};

export type CommissionSplitRow = {
  id: string;
  beneficiaryType: string;
  label: string | null;
  percent: number;
  value: number;
  status: string;
  releasedAtLabel: string | null;
  paidAtLabel: string | null;
};

export function SaleDetailTabs({
  saleId,
  indexFreshnessBanner,
  contract,
  timeline,
  paymentFlowItems,
  installments,
  portfolioTotalValue,
  portfolioId,
  openInstallments,
  applicableTemplates,
  generatedDocuments,
  commissionSplits,
  downPaymentAbatement,
  saleTotal,
  proposalBrokerName,
  proposalAgencyName,
  signedDocumentUrl,
  indexRules,
  correctionCurrent,
  downPaymentTableDefault,
  downPaymentOverride,
  contractNumber,
  contractIssuedAtLabel,
  contractSignedAtLabel,
  canCreateContract,
  canEditContract,
  canRegisterPayment,
  canRecalculate,
  canGenerateDocument,
  canEditSale,
  amendments,
  amendmentTemplates,
  remainingBalance,
  assignments,
  assignmentTemplates,
  customers,
  distrato,
  distratoTemplates,
  distratoRetentionPercent,
}: {
  saleId: string;
  /** Server Component pré-renderizado no page.tsx — não dá pra importar/renderizar Server Component de dentro de um Client Component. */
  indexFreshnessBanner: ReactNode;
  contract: { id: string; status: string; signedDocumentPath: string | null; customerName: string } | null;
  timeline: TimelineEventRow[];
  paymentFlowItems: PaymentFlowItemRow[];
  installments: InstallmentRow[];
  portfolioTotalValue: number | null;
  portfolioId: string | null;
  openInstallments: { id: string; label: string; dueDate: string }[];
  applicableTemplates: { id: string; label: string }[];
  generatedDocuments: GeneratedDocumentRow[];
  commissionSplits: CommissionSplitRow[];
  downPaymentAbatement: { downPaymentTotal: number; commissionExcess: number | null } | null;
  saleTotal: number;
  proposalBrokerName: string | null;
  proposalAgencyName: string | null;
  signedDocumentUrl: string | null;
  indexRules: { id: string; name: string }[];
  correctionCurrent: {
    indexRuleId: string | null;
    monthlyInterestPercent: number | null;
    interestType: string;
    latePaymentFinePercent: number;
    latePaymentMonthlyInterestPercent: number;
  } | null;
  downPaymentTableDefault: string | null;
  downPaymentOverride: string | null;
  contractNumber: string | null;
  contractIssuedAtLabel: string | null;
  contractSignedAtLabel: string | null;
  canCreateContract: boolean;
  canEditContract: boolean;
  canRegisterPayment: boolean;
  canRecalculate: boolean;
  canGenerateDocument: boolean;
  canEditSale: boolean;
  amendments: AmendmentRow[];
  amendmentTemplates: { id: string; label: string }[];
  remainingBalance: number;
  assignments: AssignmentRow[];
  assignmentTemplates: { id: string; label: string }[];
  customers: { id: string; label: string }[];
  distrato: DistratoRow | null;
  distratoTemplates: { id: string; label: string }[];
  distratoRetentionPercent: number;
}) {
  const [activeTab, setActiveTab] = useState("resumo");
  const [createContractOpen, setCreateContractOpen] = useState(false);
  const [correctionRuleOpen, setCorrectionRuleOpen] = useState(false);
  const [downPaymentDestOpen, setDownPaymentDestOpen] = useState(false);
  const [newAmendmentOpen, setNewAmendmentOpen] = useState(false);
  const [newAssignmentOpen, setNewAssignmentOpen] = useState(false);
  const [newDistratoOpen, setNewDistratoOpen] = useState(false);

  const tabs: TabDef[] = [
    { id: "resumo", label: "Resumo" },
    { id: "fluxo", label: "Fluxo de pagamento" },
    { id: "contrato", label: "Contrato" },
    { id: "comissoes", label: "Comissões" },
    { id: "documentos", label: "Documentos" },
  ];

  return (
    <>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div hidden={activeTab !== "resumo"} style={{ marginTop: "1.25rem" }}>
        <div className="inc-grid-2" style={{ marginBottom: "var(--inc-space-10)", gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="inc-kpi">
            <p className="inc-kpi__label">Valor da venda</p>
            <p className="inc-kpi__value" style={{ fontSize: "19px" }}>{formatCurrency(saleTotal)}</p>
          </div>
          <div className="inc-kpi inc-kpi--sky">
            <p className="inc-kpi__label">Status do contrato</p>
            <p className="inc-kpi__value" style={{ fontSize: "19px" }}>
              {contract ? (CONTRACT_STATUS_LABELS[contract.status] ?? contract.status) : "Sem contrato"}
            </p>
          </div>
          <div className="inc-kpi inc-kpi--gold">
            <p className="inc-kpi__label">Corretor/imobiliária</p>
            <p className="inc-kpi__value" style={{ fontSize: "19px" }}>{proposalBrokerName ?? proposalAgencyName ?? "—"}</p>
          </div>
        </div>

        <div className="inc-card">
          <div className="inc-card__head">
            <span className="inc-card__title">Linha do tempo</span>
          </div>
          <div className="inc-card__body">
            {timeline.length === 0 ? (
              <p className="inc-help">Nenhum evento registrado ainda.</p>
            ) : (
              <ul style={{ paddingLeft: "1.1rem", fontSize: "var(--inc-fs-base)", lineHeight: 1.8 }}>
                {timeline.map((event) => (
                  <li key={event.id}>
                    {event.label} — {event.occurredAtLabel}
                    {event.actorName ? ` — por ${event.actorName}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div hidden={activeTab !== "fluxo"} style={{ marginTop: "1.25rem" }}>
        <div className="inc-card">
          <div className="inc-card__head">
            <span className="inc-card__title">Fluxo contratado</span>
          </div>
          <div className="inc-card__body">
            {paymentFlowItems.length > 0 ? (
              <ul style={{ paddingLeft: "1.1rem", fontSize: "var(--inc-fs-base)" }}>
                {paymentFlowItems.map((item, index) => (
                  <li key={index}>
                    {item.label}: {formatCurrency(item.amount)} (mês {item.dueOffsetMonths})
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inc-help">Sem fluxo negociado registrado.</p>
            )}
          </div>
        </div>

        {portfolioTotalValue !== null && portfolioId ? (
          <div className="inc-card" style={{ marginTop: "var(--inc-space-10)" }}>
            <div className="inc-card__head">
              <span className="inc-card__title">Carteira / extrato</span>
              <span className="inc-card__meta">Total nominal: {formatCurrency(portfolioTotalValue)}</span>
            </div>
            <div className="inc-card__body">
              {indexFreshnessBanner}

              {canRecalculate ? (
                <div style={{ marginTop: "var(--inc-space-6)" }}>
                  <RecalculatePortfolioButton saleId={saleId} portfolioId={portfolioId} />
                </div>
              ) : null}

              <div style={{ overflowX: "auto", marginTop: "var(--inc-space-8)" }}>
                <table className="inc-table" style={{ maxWidth: 900 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Parcela</th>
                      <th>Vencimento</th>
                      <th>Original</th>
                      <th>Corrigido</th>
                      <th>Pago</th>
                      <th>Status</th>
                      {canRegisterPayment ? <th>Recebimento</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {installments.map((installment) => (
                      <tr key={installment.id}>
                        <td>{installment.sequence}</td>
                        <td className="is-key">{installment.label}</td>
                        <td>{installment.dueDateLabel}</td>
                        <td className="is-num">{formatCurrency(installment.originalValue)}</td>
                        <td className="is-num">
                          {installment.correctedValue !== null ? formatCurrency(installment.correctedValue) : "—"}
                        </td>
                        <td className="is-num">{formatCurrency(installment.paidAmount)}</td>
                        <td>{INSTALLMENT_STATUS_LABELS[installment.status] ?? installment.status}</td>
                        {canRegisterPayment ? (
                          <td>
                            {installment.status !== "PAID" && installment.status !== "CANCELLED" ? (
                              <RegisterPaymentForm saleId={saleId} installmentId={installment.id} />
                            ) : (
                              "—"
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {openInstallments.length > 0 ? (
          <div className="inc-card" style={{ marginTop: "var(--inc-space-10)" }}>
            <div className="inc-card__head">
              <span className="inc-card__title">Simular antecipação</span>
            </div>
            <div className="inc-card__body">
              <AnticipationForm installments={openInstallments} />
            </div>
          </div>
        ) : null}
      </div>

      <div hidden={activeTab !== "contrato"} style={{ marginTop: "1.25rem" }}>
        {!contract ? (
          canCreateContract ? (
            <div className="inc-card">
              <div className="inc-card__head">
                <span className="inc-card__title">Contrato</span>
              </div>
              <div className="inc-card__body">
                <p className="inc-help">Nenhum contrato gerado ainda.</p>
                <button
                  type="button"
                  className="inc-btn inc-btn--primary"
                  style={{ marginTop: "var(--inc-space-6)" }}
                  onClick={() => setCreateContractOpen(true)}
                >
                  + Gerar minuta
                </button>
              </div>
            </div>
          ) : (
            <p className="inc-help">Nenhum contrato gerado ainda.</p>
          )
        ) : null}
        {createContractOpen ? (
          <CreateContractForm saleId={saleId} onClose={() => setCreateContractOpen(false)} />
        ) : null}
        {contract ? (
          <>
            <div className="inc-card">
              <div className="inc-card__head">
                <span className="inc-card__title">{contractNumber}</span>
                <span className={`inc-chip ${CONTRACT_STATUS_CHIP[contract.status] ?? ""}`}>
                  {CONTRACT_STATUS_LABELS[contract.status] ?? contract.status}
                </span>
                {contract.status === "CANCELLED" && distrato ? (
                  <span className="inc-card__meta">distrato {distrato.distratoNumber}</span>
                ) : null}
              </div>
              <div className="inc-card__body">
                <p className="inc-help">
                  Gerado em {contractIssuedAtLabel}
                  {contractSignedAtLabel ? ` · assinado em ${contractSignedAtLabel}` : ""}
                </p>
                {signedDocumentUrl ? (
                  <p style={{ fontSize: "var(--inc-fs-base)", marginTop: "var(--inc-space-4)" }}>
                    <a href={signedDocumentUrl} target="_blank" rel="noreferrer">
                      Baixar contrato assinado (PDF)
                    </a>{" "}
                    <span className="inc-help" style={{ display: "inline" }}>— link válido por 1 hora</span>
                  </p>
                ) : contract.signedDocumentPath ? (
                  <p className="inc-help inc-help--error" style={{ marginTop: "var(--inc-space-4)" }}>
                    Contrato assinado enviado, mas não foi possível gerar o link agora.
                  </p>
                ) : null}

                {canGenerateDocument ? (
                  <div style={{ marginTop: "var(--inc-space-8)" }}>
                    <p className="inc-label">Gerar documento</p>
                    <div style={{ marginTop: "var(--inc-space-3)" }}>
                      <GenerateDocumentForm saleId={saleId} contractId={contract.id} templates={applicableTemplates} />
                    </div>
                  </div>
                ) : null}

                <div className="inc-row" style={{ marginTop: "var(--inc-space-8)" }}>
                  {canEditContract && contract.status === "DRAFT" ? (
                    <MarkAwaitingSignatureForm saleId={saleId} contractId={contract.id} />
                  ) : null}
                </div>

                {canEditContract && contract.status === "AWAITING_SIGNATURE" ? (
                  <div style={{ marginTop: "var(--inc-space-8)" }}>
                    <ConfirmSignatureForm saleId={saleId} contractId={contract.id} />
                  </div>
                ) : null}
              </div>
            </div>

            {(contract.status !== "SIGNED") && canEditSale ? (
              <div className="inc-card" style={{ marginTop: "var(--inc-space-10)" }}>
                <div className="inc-card__head">
                  <span className="inc-card__title">Destino da entrada</span>
                </div>
                <div className="inc-card__body">
                  <p className="inc-help" style={{ maxWidth: 500 }}>
                    Só pode ser alterado antes da assinatura — a carteira é montada com o destino
                    vigente nesse momento.
                  </p>
                  <div style={{ marginTop: "var(--inc-space-8)" }}>
                    <button
                      type="button"
                      className="inc-btn inc-btn--secondary inc-btn--sm"
                      onClick={() => setDownPaymentDestOpen(true)}
                    >
                      + Definir destino da entrada
                    </button>
                  </div>
                  {downPaymentDestOpen ? (
                    <DownPaymentDestinationForm
                      saleId={saleId}
                      tableDefault={downPaymentTableDefault}
                      override={downPaymentOverride}
                      onClose={() => setDownPaymentDestOpen(false)}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            {canEditContract && correctionCurrent ? (
              <div className="inc-card" style={{ marginTop: "var(--inc-space-10)" }}>
                <div className="inc-card__head">
                  <span className="inc-card__title">Regra de correção — fase de obra</span>
                </div>
                <div className="inc-card__body">
                  <p className="inc-help" style={{ maxWidth: 500 }}>
                    Índice, juros adicionais e multa/mora usados até o Habite-se do empreendimento. A
                    regra de correção pós-Habite-se é configurada no cadastro do empreendimento (mesma
                    para todos os contratos dele) — veja a página do empreendimento.
                  </p>
                  <div style={{ marginTop: "var(--inc-space-8)" }}>
                    <button
                      type="button"
                      className="inc-btn inc-btn--secondary inc-btn--sm"
                      onClick={() => setCorrectionRuleOpen(true)}
                    >
                      + Definir regra de correção
                    </button>
                  </div>
                  {correctionRuleOpen ? (
                    <CorrectionRuleForm
                      saleId={saleId}
                      contractId={contract.id}
                      indexRules={indexRules}
                      current={correctionCurrent}
                      onClose={() => setCorrectionRuleOpen(false)}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            {contract.status === "SIGNED" ? (
              <div className="inc-card" style={{ marginTop: "var(--inc-space-10)" }}>
                <div className="inc-card__head">
                  <span className="inc-card__title">Aditivos</span>
                </div>
                <div className="inc-card__body">
                  <p className="inc-help" style={{ maxWidth: 500 }}>
                    Criado a partir do contrato vigente. Renegociação de fluxo reprograma a carteira ao
                    assinar — parcelas já recebidas nunca são alteradas.
                  </p>

                  {amendments.length > 0 ? (
                    <div className="inc-col" style={{ gap: "var(--inc-space-8)", marginTop: "var(--inc-space-8)" }}>
                      {amendments.map((amendment) => (
                        <div key={amendment.id} className="inc-card">
                          <div className="inc-card__head">
                            <span className="inc-card__title" style={{ fontSize: "var(--inc-fs-base)" }}>
                              {amendment.amendmentNumber} — {AMENDMENT_TYPE_LABELS[amendment.type] ?? amendment.type}
                            </span>
                            <span className={`inc-chip ${DRAFT_SIGNED_CHIP[amendment.status] ?? ""}`}>
                              {AMENDMENT_STATUS_LABELS[amendment.status] ?? amendment.status}
                            </span>
                          </div>
                          <div className="inc-card__body">
                            <p className="inc-help">
                              Criado em {amendment.createdAtLabel}
                              {amendment.signedAtLabel ? ` · assinado em ${amendment.signedAtLabel}` : ""}
                            </p>
                            {amendment.notes ? (
                              <p style={{ fontSize: "var(--inc-fs-base)", marginTop: "var(--inc-space-4)" }}>{amendment.notes}</p>
                            ) : null}

                            {amendment.proposedFlowItems ? (
                              <details style={{ marginTop: "var(--inc-space-6)" }}>
                                <summary style={{ fontSize: "var(--inc-fs-sm)", cursor: "pointer" }}>Novo fluxo proposto</summary>
                                <ul style={{ paddingLeft: "1.1rem", marginTop: "var(--inc-space-4)", fontSize: "var(--inc-fs-sm)" }}>
                                  {amendment.proposedFlowItems.map((item, index) => (
                                    <li key={index}>
                                      {item.label}: {formatCurrency(item.amount)} (mês {item.dueOffsetMonths})
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : null}

                            {canGenerateDocument ? (
                              <div style={{ marginTop: "var(--inc-space-6)" }}>
                                <p className="inc-label">Gerar documento</p>
                                <div style={{ marginTop: "var(--inc-space-3)" }}>
                                  <AmendmentDocumentForm
                                    saleId={saleId}
                                    contractId={contract.id}
                                    amendmentId={amendment.id}
                                    templates={amendmentTemplates}
                                  />
                                </div>
                              </div>
                            ) : null}

                            {amendment.generatedDocuments.length > 0 ? (
                              <ul style={{ paddingLeft: "1.1rem", marginTop: "var(--inc-space-6)", fontSize: "var(--inc-fs-sm)" }}>
                                {amendment.generatedDocuments.map((doc) => (
                                  <li key={doc.id}>
                                    {doc.fileName} — {doc.uploadedByName} em {doc.createdAtLabel}
                                    {doc.downloadUrl ? (
                                      <>
                                        {" "}
                                        —{" "}
                                        <a href={doc.downloadUrl} target="_blank" rel="noreferrer">
                                          Baixar
                                        </a>
                                      </>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            ) : null}

                            {canEditContract && amendment.status === "DRAFT" ? (
                              <div style={{ marginTop: "var(--inc-space-6)" }}>
                                <SignAmendmentButton saleId={saleId} amendmentId={amendment.id} />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="inc-help" style={{ marginTop: "var(--inc-space-6)" }}>Nenhum aditivo criado ainda.</p>
                  )}

                  {canEditContract ? (
                    <div style={{ marginTop: "var(--inc-space-8)" }}>
                      <button
                        type="button"
                        className="inc-btn inc-btn--primary inc-btn--sm"
                        onClick={() => setNewAmendmentOpen(true)}
                      >
                        + Novo aditivo
                      </button>
                      {newAmendmentOpen ? (
                        <NewAmendmentForm
                          saleId={saleId}
                          contractId={contract.id}
                          remainingBalance={remainingBalance}
                          onClose={() => setNewAmendmentOpen(false)}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {contract.status === "SIGNED" ? (
              <div className="inc-card" style={{ marginTop: "var(--inc-space-10)" }}>
                <div className="inc-card__head">
                  <span className="inc-card__title">Cessão de direitos</span>
                </div>
                <div className="inc-card__body">
                  <p className="inc-help" style={{ maxWidth: 500 }}>
                    Transfere a titularidade do contrato pro cessionário. A carteira não é recriada — as
                    mesmas parcelas continuam, o histórico do cedente é preservado; a taxa de cessão
                    (se houver) vira uma parcela nova.
                  </p>

                  {assignments.length > 0 ? (
                    <div className="inc-col" style={{ gap: "var(--inc-space-8)", marginTop: "var(--inc-space-8)" }}>
                      {assignments.map((assignment) => (
                        <div key={assignment.id} className="inc-card">
                          <div className="inc-card__head">
                            <span className="inc-card__title" style={{ fontSize: "var(--inc-fs-base)" }}>
                              {assignment.assignmentNumber}
                            </span>
                            <span className={`inc-chip ${DRAFT_SIGNED_CHIP[assignment.status] ?? ""}`}>
                              {ASSIGNMENT_STATUS_LABELS[assignment.status] ?? assignment.status}
                            </span>
                          </div>
                          <div className="inc-card__body">
                            <p style={{ fontSize: "var(--inc-fs-base)" }}>
                              {assignment.previousCustomerName} → {assignment.newCustomerName} — cessão em{" "}
                              {assignment.assignmentDateLabel}
                              {assignment.feeAmount ? ` · taxa de ${formatCurrency(assignment.feeAmount)}` : ""}
                            </p>
                            <p className="inc-help" style={{ marginTop: "var(--inc-space-3)" }}>
                              Criado em {assignment.createdAtLabel}
                              {assignment.signedAtLabel ? ` · assinado em ${assignment.signedAtLabel}` : ""}
                            </p>
                            {assignment.notes ? (
                              <p style={{ fontSize: "var(--inc-fs-base)", marginTop: "var(--inc-space-4)" }}>{assignment.notes}</p>
                            ) : null}

                            {canGenerateDocument ? (
                              <div style={{ marginTop: "var(--inc-space-6)" }}>
                                <p className="inc-label">Gerar documento</p>
                                <div style={{ marginTop: "var(--inc-space-3)" }}>
                                  <AssignmentDocumentForm
                                    saleId={saleId}
                                    contractId={contract.id}
                                    assignmentId={assignment.id}
                                    templates={assignmentTemplates}
                                  />
                                </div>
                              </div>
                            ) : null}

                            {assignment.generatedDocuments.length > 0 ? (
                              <ul style={{ paddingLeft: "1.1rem", marginTop: "var(--inc-space-6)", fontSize: "var(--inc-fs-sm)" }}>
                                {assignment.generatedDocuments.map((doc) => (
                                  <li key={doc.id}>
                                    {doc.fileName} — {doc.uploadedByName} em {doc.createdAtLabel}
                                    {doc.downloadUrl ? (
                                      <>
                                        {" "}
                                        —{" "}
                                        <a href={doc.downloadUrl} target="_blank" rel="noreferrer">
                                          Baixar
                                        </a>
                                      </>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            ) : null}

                            {canEditContract && assignment.status === "DRAFT" ? (
                              <div style={{ marginTop: "var(--inc-space-6)" }}>
                                <SignAssignmentButton saleId={saleId} assignmentId={assignment.id} />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="inc-help" style={{ marginTop: "var(--inc-space-6)" }}>Nenhuma cessão criada ainda.</p>
                  )}

                  {canEditContract ? (
                    <div style={{ marginTop: "var(--inc-space-8)" }}>
                      <button
                        type="button"
                        className="inc-btn inc-btn--primary inc-btn--sm"
                        onClick={() => setNewAssignmentOpen(true)}
                      >
                        + Nova cessão
                      </button>
                      {newAssignmentOpen ? (
                        <NewAssignmentForm
                          saleId={saleId}
                          contractId={contract.id}
                          customers={customers}
                          currentCustomerName={contract.customerName}
                          onClose={() => setNewAssignmentOpen(false)}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {contract.status === "SIGNED" || distrato ? (
              <div className="inc-card" style={{ marginTop: "var(--inc-space-10)" }}>
                <div className="inc-card__head">
                  <span className="inc-card__title">Distrato</span>
                </div>
                <div className="inc-card__body">
                  <p className="inc-help" style={{ maxWidth: 500 }}>
                    Rescisão conforme Lei 13.786/18 — retenção da incorporadora de {distratoRetentionPercent}% do
                    total pago (configurável por empreendimento). Ao assinar: contrato encerrado, unidade volta a
                    Disponível, parcelas futuras canceladas (histórico preservado) e devolução lançada em Contas a
                    pagar.
                  </p>

                  {distrato ? (
                    <div className="inc-card" style={{ marginTop: "var(--inc-space-8)" }}>
                      <div className="inc-card__head">
                        <span className="inc-card__title" style={{ fontSize: "var(--inc-fs-base)" }}>
                          {distrato.distratoNumber}
                        </span>
                        <span className={`inc-chip ${DRAFT_SIGNED_CHIP[distrato.status] ?? ""}`}>
                          {DISTRATO_STATUS_LABELS[distrato.status] ?? distrato.status}
                        </span>
                      </div>
                      <div className="inc-card__body">
                        <div style={{ overflowX: "auto" }}>
                          <table className="inc-table">
                            <tbody>
                              <tr>
                                <td className="is-muted">Total pago pelo cliente</td>
                                <td className="is-num">{formatCurrency(distrato.totalPaid)}</td>
                              </tr>
                              <tr>
                                <td className="is-muted">Retenção ({distrato.retentionPercent}%)</td>
                                <td className="is-num">-{formatCurrency(distrato.retentionAmount)}</td>
                              </tr>
                              {distrato.brokerageDeductionAmount ? (
                                <tr>
                                  <td className="is-muted">Dedução — corretagem</td>
                                  <td className="is-num">-{formatCurrency(distrato.brokerageDeductionAmount)}</td>
                                </tr>
                              ) : null}
                              {distrato.occupancyFeeAmount ? (
                                <tr>
                                  <td className="is-muted">Dedução — fruição/ocupação</td>
                                  <td className="is-num">-{formatCurrency(distrato.occupancyFeeAmount)}</td>
                                </tr>
                              ) : null}
                              <tr>
                                <td className="is-strong">Valor a devolver</td>
                                <td className="is-num is-strong">{formatCurrency(distrato.refundAmount)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <p className="inc-help" style={{ marginTop: "var(--inc-space-6)" }}>
                          Prazo de devolução: {distrato.refundDueDateLabel}
                          {distrato.refundTerms ? ` · ${distrato.refundTerms}` : ""}
                          {distrato.refundPayableId ? " · lançado em Contas a pagar" : ""}
                        </p>
                        {distrato.reason ? (
                          <p style={{ fontSize: "var(--inc-fs-base)", marginTop: "var(--inc-space-3)" }}>{distrato.reason}</p>
                        ) : null}
                        <p className="inc-help">
                          Criado em {distrato.createdAtLabel}
                          {distrato.signedAtLabel ? ` · assinado em ${distrato.signedAtLabel}` : ""}
                        </p>

                        {canGenerateDocument ? (
                          <div style={{ marginTop: "var(--inc-space-6)" }}>
                            <p className="inc-label">Gerar documento</p>
                            <div style={{ marginTop: "var(--inc-space-3)" }}>
                              <DistratoDocumentForm
                                saleId={saleId}
                                contractId={contract.id}
                                distratoId={distrato.id}
                                templates={distratoTemplates}
                              />
                            </div>
                          </div>
                        ) : null}

                        {distrato.generatedDocuments.length > 0 ? (
                          <ul style={{ paddingLeft: "1.1rem", marginTop: "var(--inc-space-6)", fontSize: "var(--inc-fs-sm)" }}>
                            {distrato.generatedDocuments.map((doc) => (
                              <li key={doc.id}>
                                {doc.fileName} — {doc.uploadedByName} em {doc.createdAtLabel}
                                {doc.downloadUrl ? (
                                  <>
                                    {" "}
                                    —{" "}
                                    <a href={doc.downloadUrl} target="_blank" rel="noreferrer">
                                      Baixar
                                    </a>
                                  </>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {canEditContract && distrato.status === "DRAFT" ? (
                          <div style={{ marginTop: "var(--inc-space-6)" }}>
                            <SignDistratoButton saleId={saleId} distratoId={distrato.id} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p className="inc-help" style={{ marginTop: "var(--inc-space-6)" }}>Nenhum distrato iniciado.</p>
                  )}

                  {canEditContract && contract.status === "SIGNED" && !distrato ? (
                    <div style={{ marginTop: "var(--inc-space-8)" }}>
                      <button
                        type="button"
                        className="inc-btn inc-btn--primary inc-btn--sm"
                        onClick={() => setNewDistratoOpen(true)}
                      >
                        + Novo distrato
                      </button>
                      {newDistratoOpen ? (
                        <NewDistratoForm
                          saleId={saleId}
                          contractId={contract.id}
                          retentionPercent={distratoRetentionPercent}
                          onClose={() => setNewDistratoOpen(false)}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div hidden={activeTab !== "comissoes"} style={{ marginTop: "1.25rem" }}>
        <div className="inc-card">
          <div className="inc-card__head">
            <span className="inc-card__title">Comissões</span>
            {commissionSplits.length > 0 ? (
              <span className="inc-card__meta">
                {commissionSplits.reduce((sum, s) => sum + s.percent, 0)}% —{" "}
                {formatCurrency(commissionSplits.reduce((sum, s) => sum + s.value, 0))}
              </span>
            ) : null}
          </div>
          <div className="inc-card__body">
            {commissionSplits.length === 0 ? (
              <p className="inc-help">Nenhuma comissão lançada.</p>
            ) : (
              <>
                {downPaymentAbatement ? (
                  <p className="inc-help" style={{ marginBottom: "var(--inc-space-6)" }}>
                    Entrada direto ao corretor abateu {formatCurrency(downPaymentAbatement.downPaymentTotal)} da
                    comissão
                    {downPaymentAbatement.commissionExcess
                      ? ` — excedente de ${formatCurrency(downPaymentAbatement.commissionExcess)} registrado como crédito à SPE`
                      : ""}
                    .
                  </p>
                ) : null}

                <div style={{ overflowX: "auto" }}>
                  <table className="inc-table" style={{ maxWidth: 800 }}>
                    <thead>
                      <tr>
                        <th>Beneficiário</th>
                        <th>%</th>
                        <th>Valor</th>
                        <th>Status</th>
                        <th>Liberada em</th>
                        <th>Paga em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissionSplits.map((split) => (
                        <tr key={split.id}>
                          <td className="is-key">
                            {COMMISSION_BENEFICIARY_LABELS[split.beneficiaryType] ?? split.beneficiaryType}
                            {split.label ? ` (${split.label})` : ""}
                          </td>
                          <td className="is-num">{split.percent}%</td>
                          <td className="is-num">{formatCurrency(split.value)}</td>
                          <td>{COMMISSION_STATUS_LABELS[split.status] ?? split.status}</td>
                          <td className="is-muted">{split.releasedAtLabel ?? "—"}</td>
                          <td className="is-muted">{split.paidAtLabel ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <p className="inc-help" style={{ marginTop: "var(--inc-space-8)" }}>
              A comissão libera conforme a regra do empreendimento e vira conta a pagar automaticamente
              (fornecedor = corretor/imobiliária) — pagar em Contas a pagar marca a comissão como paga
              também, sem lançamento duplicado. Em caso de distrato, comissões ainda não pagas são
              estornadas (cancelada) conforme a regra do empreendimento — as já pagas não são mexidas.
            </p>
          </div>
        </div>
      </div>

      <div hidden={activeTab !== "documentos"} style={{ marginTop: "1.25rem" }}>
        <div className="inc-card">
          <div className="inc-card__head">
            <span className="inc-card__title">Documentos gerados</span>
          </div>
          <div className="inc-card__body">
            {generatedDocuments.length === 0 ? (
              <p className="inc-help">Nenhum documento gerado ainda.</p>
            ) : (
              <ul style={{ paddingLeft: "1.1rem", fontSize: "var(--inc-fs-base)" }}>
                {generatedDocuments.map((doc) => (
                  <li key={doc.id}>
                    {doc.fileName} — v{doc.templateVersion} — {doc.uploadedByName} em {doc.createdAtLabel}
                    {doc.downloadUrl ? (
                      <>
                        {" "}
                        —{" "}
                        <a href={doc.downloadUrl} target="_blank" rel="noreferrer">
                          Baixar
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
