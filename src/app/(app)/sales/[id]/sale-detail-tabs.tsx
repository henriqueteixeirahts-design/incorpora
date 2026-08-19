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

export type TimelineEventRow = { id: string; label: string; occurredAtLabel: string };

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
        <div className="field-grid" style={{ marginBottom: "1.25rem" }}>
          <div>
            <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Valor da venda</p>
            <p>{formatCurrency(saleTotal)}</p>
          </div>
          <div>
            <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Status do contrato</p>
            <p>{contract ? (CONTRACT_STATUS_LABELS[contract.status] ?? contract.status) : "Sem contrato"}</p>
          </div>
          <div>
            <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Corretor/imobiliária</p>
            <p>{proposalBrokerName ?? proposalAgencyName ?? "—"}</p>
          </div>
        </div>

        <h3 style={{ fontSize: "1rem" }}>Linha do tempo</h3>
        {timeline.length === 0 ? (
          <p style={{ opacity: 0.7, fontSize: "0.85rem", marginTop: "0.5rem" }}>Nenhum evento registrado ainda.</p>
        ) : (
          <ul style={{ marginTop: "0.5rem", paddingLeft: "1.1rem", fontSize: "0.85rem", lineHeight: 1.8 }}>
            {timeline.map((event) => (
              <li key={event.id}>
                {event.label} — {event.occurredAtLabel}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div hidden={activeTab !== "fluxo"} style={{ marginTop: "1.25rem" }}>
        <h3 style={{ fontSize: "1rem" }}>Fluxo contratado</h3>
        {paymentFlowItems.length > 0 ? (
          <ul style={{ marginTop: "0.5rem", paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
            {paymentFlowItems.map((item, index) => (
              <li key={index}>
                {item.label}: {formatCurrency(item.amount)} (mês {item.dueOffsetMonths})
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>Sem fluxo negociado registrado.</p>
        )}

        {portfolioTotalValue !== null && portfolioId ? (
          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ fontSize: "1rem" }}>Carteira / extrato</h3>
            <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Total nominal: {formatCurrency(portfolioTotalValue)}</p>

            {indexFreshnessBanner}

            {canRecalculate ? (
              <div style={{ marginTop: "0.5rem" }}>
                <RecalculatePortfolioButton saleId={saleId} portfolioId={portfolioId} />
              </div>
            ) : null}

            <table style={{ marginTop: "0.75rem", maxWidth: 900 }}>
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
                    <td>{installment.label}</td>
                    <td>{installment.dueDateLabel}</td>
                    <td>{formatCurrency(installment.originalValue)}</td>
                    <td>{installment.correctedValue !== null ? formatCurrency(installment.correctedValue) : "—"}</td>
                    <td>{formatCurrency(installment.paidAmount)}</td>
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
        ) : null}

        {openInstallments.length > 0 ? (
          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ fontSize: "1rem" }}>Simular antecipação</h3>
            <div style={{ marginTop: "0.75rem" }}>
              <AnticipationForm installments={openInstallments} />
            </div>
          </div>
        ) : null}
      </div>

      <div hidden={activeTab !== "contrato"} style={{ marginTop: "1.25rem" }}>
        {!contract ? (
          canCreateContract ? (
            <CreateContractForm saleId={saleId} />
          ) : (
            <p style={{ opacity: 0.7 }}>Nenhum contrato gerado ainda.</p>
          )
        ) : (
          <>
            <p>
              <strong>{contractNumber}</strong> — {CONTRACT_STATUS_LABELS[contract.status] ?? contract.status}
              {contract.status === "CANCELLED" && distrato ? ` (distrato ${distrato.distratoNumber})` : ""}
            </p>
            <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
              Gerado em {contractIssuedAtLabel}
              {contractSignedAtLabel ? ` · assinado em ${contractSignedAtLabel}` : ""}
            </p>
            {signedDocumentUrl ? (
              <p style={{ fontSize: "0.85rem" }}>
                <a href={signedDocumentUrl} target="_blank" rel="noreferrer">
                  Baixar contrato assinado (PDF)
                </a>{" "}
                <span style={{ opacity: 0.6 }}>— link válido por 1 hora</span>
              </p>
            ) : contract.signedDocumentPath ? (
              <p style={{ fontSize: "0.85rem" }} className="error-text">
                Contrato assinado enviado, mas não foi possível gerar o link agora.
              </p>
            ) : null}

            {canGenerateDocument ? (
              <div style={{ marginTop: "0.75rem" }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 500 }}>Gerar documento</p>
                <GenerateDocumentForm saleId={saleId} contractId={contract.id} templates={applicableTemplates} />
              </div>
            ) : null}

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              {canEditContract && contract.status === "DRAFT" ? (
                <MarkAwaitingSignatureForm saleId={saleId} contractId={contract.id} />
              ) : null}
            </div>

            {canEditContract && contract.status === "AWAITING_SIGNATURE" ? (
              <div style={{ marginTop: "0.75rem" }}>
                <ConfirmSignatureForm saleId={saleId} contractId={contract.id} />
              </div>
            ) : null}

            {(contract.status !== "SIGNED") && canEditSale ? (
              <div style={{ marginTop: "1.5rem" }}>
                <h3 style={{ fontSize: "1rem" }}>Destino da entrada</h3>
                <p style={{ fontSize: "0.85rem", opacity: 0.7, maxWidth: 500 }}>
                  Só pode ser alterado antes da assinatura — a carteira é montada com o destino
                  vigente nesse momento.
                </p>
                <div style={{ marginTop: "0.75rem" }}>
                  <DownPaymentDestinationForm
                    saleId={saleId}
                    tableDefault={downPaymentTableDefault}
                    override={downPaymentOverride}
                  />
                </div>
              </div>
            ) : null}

            {canEditContract && correctionCurrent ? (
              <div style={{ marginTop: "1.5rem" }}>
                <h3 style={{ fontSize: "1rem" }}>Regra de correção — fase de obra</h3>
                <p style={{ fontSize: "0.85rem", opacity: 0.7, maxWidth: 500 }}>
                  Índice, juros adicionais e multa/mora usados até o Habite-se do empreendimento. A
                  regra de correção pós-Habite-se é configurada no cadastro do empreendimento (mesma
                  para todos os contratos dele) — veja a página do empreendimento.
                </p>
                <div style={{ marginTop: "0.75rem" }}>
                  <CorrectionRuleForm
                    saleId={saleId}
                    contractId={contract.id}
                    indexRules={indexRules}
                    current={correctionCurrent}
                  />
                </div>
              </div>
            ) : null}

            {contract.status === "SIGNED" ? (
              <div style={{ marginTop: "1.5rem" }}>
                <h3 style={{ fontSize: "1rem" }}>Aditivos</h3>
                <p style={{ fontSize: "0.85rem", opacity: 0.7, maxWidth: 500 }}>
                  Criado a partir do contrato vigente. Renegociação de fluxo reprograma a carteira ao
                  assinar — parcelas já recebidas nunca são alteradas.
                </p>

                {amendments.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.75rem" }}>
                    {amendments.map((amendment) => (
                      <div
                        key={amendment.id}
                        style={{
                          border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
                          borderRadius: 8,
                          padding: "0.75rem 1rem",
                        }}
                      >
                        <p>
                          <strong>{amendment.amendmentNumber}</strong> — {AMENDMENT_TYPE_LABELS[amendment.type] ?? amendment.type}{" "}
                          — {AMENDMENT_STATUS_LABELS[amendment.status] ?? amendment.status}
                        </p>
                        <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                          Criado em {amendment.createdAtLabel}
                          {amendment.signedAtLabel ? ` · assinado em ${amendment.signedAtLabel}` : ""}
                        </p>
                        {amendment.notes ? <p style={{ fontSize: "0.85rem" }}>{amendment.notes}</p> : null}

                        {amendment.proposedFlowItems ? (
                          <details style={{ marginTop: "0.5rem" }}>
                            <summary style={{ fontSize: "0.85rem", cursor: "pointer" }}>Novo fluxo proposto</summary>
                            <ul style={{ paddingLeft: "1.1rem", marginTop: "0.4rem", fontSize: "0.85rem" }}>
                              {amendment.proposedFlowItems.map((item, index) => (
                                <li key={index}>
                                  {item.label}: {formatCurrency(item.amount)} (mês {item.dueOffsetMonths})
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}

                        {canGenerateDocument ? (
                          <div style={{ marginTop: "0.5rem" }}>
                            <p style={{ fontSize: "0.8rem", fontWeight: 500 }}>Gerar documento</p>
                            <AmendmentDocumentForm
                              saleId={saleId}
                              contractId={contract.id}
                              amendmentId={amendment.id}
                              templates={amendmentTemplates}
                            />
                          </div>
                        ) : null}

                        {amendment.generatedDocuments.length > 0 ? (
                          <ul style={{ paddingLeft: "1.1rem", marginTop: "0.5rem", fontSize: "0.8rem" }}>
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
                          <div style={{ marginTop: "0.5rem" }}>
                            <SignAmendmentButton saleId={saleId} amendmentId={amendment.id} />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ opacity: 0.7, fontSize: "0.85rem", marginTop: "0.5rem" }}>Nenhum aditivo criado ainda.</p>
                )}

                {canEditContract ? (
                  <div style={{ marginTop: "1rem" }}>
                    <NewAmendmentForm saleId={saleId} contractId={contract.id} remainingBalance={remainingBalance} />
                  </div>
                ) : null}
              </div>
            ) : null}

            {contract.status === "SIGNED" ? (
              <div style={{ marginTop: "1.5rem" }}>
                <h3 style={{ fontSize: "1rem" }}>Cessão de direitos</h3>
                <p style={{ fontSize: "0.85rem", opacity: 0.7, maxWidth: 500 }}>
                  Transfere a titularidade do contrato pro cessionário. A carteira não é recriada — as
                  mesmas parcelas continuam, o histórico do cedente é preservado; a taxa de cessão
                  (se houver) vira uma parcela nova.
                </p>

                {assignments.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.75rem" }}>
                    {assignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        style={{
                          border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
                          borderRadius: 8,
                          padding: "0.75rem 1rem",
                        }}
                      >
                        <p>
                          <strong>{assignment.assignmentNumber}</strong> —{" "}
                          {ASSIGNMENT_STATUS_LABELS[assignment.status] ?? assignment.status}
                        </p>
                        <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                          {assignment.previousCustomerName} → {assignment.newCustomerName} — cessão em{" "}
                          {assignment.assignmentDateLabel}
                          {assignment.feeAmount ? ` · taxa de ${formatCurrency(assignment.feeAmount)}` : ""}
                        </p>
                        <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                          Criado em {assignment.createdAtLabel}
                          {assignment.signedAtLabel ? ` · assinado em ${assignment.signedAtLabel}` : ""}
                        </p>
                        {assignment.notes ? <p style={{ fontSize: "0.85rem" }}>{assignment.notes}</p> : null}

                        {canGenerateDocument ? (
                          <div style={{ marginTop: "0.5rem" }}>
                            <p style={{ fontSize: "0.8rem", fontWeight: 500 }}>Gerar documento</p>
                            <AssignmentDocumentForm
                              saleId={saleId}
                              contractId={contract.id}
                              assignmentId={assignment.id}
                              templates={assignmentTemplates}
                            />
                          </div>
                        ) : null}

                        {assignment.generatedDocuments.length > 0 ? (
                          <ul style={{ paddingLeft: "1.1rem", marginTop: "0.5rem", fontSize: "0.8rem" }}>
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
                          <div style={{ marginTop: "0.5rem" }}>
                            <SignAssignmentButton saleId={saleId} assignmentId={assignment.id} />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ opacity: 0.7, fontSize: "0.85rem", marginTop: "0.5rem" }}>Nenhuma cessão criada ainda.</p>
                )}

                {canEditContract ? (
                  <div style={{ marginTop: "1rem" }}>
                    <NewAssignmentForm
                      saleId={saleId}
                      contractId={contract.id}
                      customers={customers}
                      currentCustomerName={contract.customerName}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {contract.status === "SIGNED" || distrato ? (
              <div style={{ marginTop: "1.5rem" }}>
                <h3 style={{ fontSize: "1rem" }}>Distrato</h3>
                <p style={{ fontSize: "0.85rem", opacity: 0.7, maxWidth: 500 }}>
                  Rescisão conforme Lei 13.786/18 — retenção da incorporadora de {distratoRetentionPercent}% do
                  total pago (configurável por empreendimento). Ao assinar: contrato encerrado, unidade volta a
                  Disponível, parcelas futuras canceladas (histórico preservado) e devolução lançada em Contas a
                  pagar.
                </p>

                {distrato ? (
                  <div
                    style={{
                      border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
                      borderRadius: 8,
                      padding: "0.75rem 1rem",
                      marginTop: "0.75rem",
                    }}
                  >
                    <p>
                      <strong>{distrato.distratoNumber}</strong> — {DISTRATO_STATUS_LABELS[distrato.status] ?? distrato.status}
                    </p>
                    <table style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
                      <tbody>
                        <tr>
                          <td style={{ opacity: 0.7, paddingRight: "1rem" }}>Total pago pelo cliente</td>
                          <td>{formatCurrency(distrato.totalPaid)}</td>
                        </tr>
                        <tr>
                          <td style={{ opacity: 0.7, paddingRight: "1rem" }}>Retenção ({distrato.retentionPercent}%)</td>
                          <td>-{formatCurrency(distrato.retentionAmount)}</td>
                        </tr>
                        {distrato.brokerageDeductionAmount ? (
                          <tr>
                            <td style={{ opacity: 0.7, paddingRight: "1rem" }}>Dedução — corretagem</td>
                            <td>-{formatCurrency(distrato.brokerageDeductionAmount)}</td>
                          </tr>
                        ) : null}
                        {distrato.occupancyFeeAmount ? (
                          <tr>
                            <td style={{ opacity: 0.7, paddingRight: "1rem" }}>Dedução — fruição/ocupação</td>
                            <td>-{formatCurrency(distrato.occupancyFeeAmount)}</td>
                          </tr>
                        ) : null}
                        <tr>
                          <td style={{ paddingRight: "1rem", fontWeight: 500 }}>Valor a devolver</td>
                          <td style={{ fontWeight: 500 }}>{formatCurrency(distrato.refundAmount)}</td>
                        </tr>
                      </tbody>
                    </table>
                    <p style={{ fontSize: "0.85rem", opacity: 0.8, marginTop: "0.5rem" }}>
                      Prazo de devolução: {distrato.refundDueDateLabel}
                      {distrato.refundTerms ? ` · ${distrato.refundTerms}` : ""}
                      {distrato.refundPayableId ? " · lançado em Contas a pagar" : ""}
                    </p>
                    {distrato.reason ? <p style={{ fontSize: "0.85rem" }}>{distrato.reason}</p> : null}
                    <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                      Criado em {distrato.createdAtLabel}
                      {distrato.signedAtLabel ? ` · assinado em ${distrato.signedAtLabel}` : ""}
                    </p>

                    {canGenerateDocument ? (
                      <div style={{ marginTop: "0.5rem" }}>
                        <p style={{ fontSize: "0.8rem", fontWeight: 500 }}>Gerar documento</p>
                        <DistratoDocumentForm
                          saleId={saleId}
                          contractId={contract.id}
                          distratoId={distrato.id}
                          templates={distratoTemplates}
                        />
                      </div>
                    ) : null}

                    {distrato.generatedDocuments.length > 0 ? (
                      <ul style={{ paddingLeft: "1.1rem", marginTop: "0.5rem", fontSize: "0.8rem" }}>
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
                      <div style={{ marginTop: "0.5rem" }}>
                        <SignDistratoButton saleId={saleId} distratoId={distrato.id} />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p style={{ opacity: 0.7, fontSize: "0.85rem", marginTop: "0.5rem" }}>Nenhum distrato iniciado.</p>
                )}

                {canEditContract && contract.status === "SIGNED" && !distrato ? (
                  <div style={{ marginTop: "1rem" }}>
                    <NewDistratoForm saleId={saleId} contractId={contract.id} retentionPercent={distratoRetentionPercent} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div hidden={activeTab !== "comissoes"} style={{ marginTop: "1.25rem" }}>
        {commissionSplits.length === 0 ? (
          <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>Nenhuma comissão lançada.</p>
        ) : (
          <>
            <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
              Comissão total: {commissionSplits.reduce((sum, s) => sum + s.percent, 0)}% —{" "}
              {formatCurrency(commissionSplits.reduce((sum, s) => sum + s.value, 0))}
            </p>
            {downPaymentAbatement ? (
              <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                Entrada direto ao corretor abateu {formatCurrency(downPaymentAbatement.downPaymentTotal)} da
                comissão
                {downPaymentAbatement.commissionExcess
                  ? ` — excedente de ${formatCurrency(downPaymentAbatement.commissionExcess)} registrado como crédito à SPE`
                  : ""}
                .
              </p>
            ) : null}

            <table style={{ maxWidth: 800, marginTop: "0.75rem" }}>
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
                    <td>
                      {COMMISSION_BENEFICIARY_LABELS[split.beneficiaryType] ?? split.beneficiaryType}
                      {split.label ? ` (${split.label})` : ""}
                    </td>
                    <td>{split.percent}%</td>
                    <td>{formatCurrency(split.value)}</td>
                    <td>{COMMISSION_STATUS_LABELS[split.status] ?? split.status}</td>
                    <td>{split.releasedAtLabel ?? "—"}</td>
                    <td>{split.paidAtLabel ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <p style={{ fontSize: "0.8rem", opacity: 0.6, marginTop: "0.75rem" }}>
          A comissão libera conforme a regra do empreendimento e vira conta a pagar automaticamente
          (fornecedor = corretor/imobiliária) — pagar em Contas a pagar marca a comissão como paga
          também, sem lançamento duplicado. Em caso de distrato, comissões ainda não pagas são
          estornadas (cancelada) conforme a regra do empreendimento — as já pagas não são mexidas.
        </p>
      </div>

      <div hidden={activeTab !== "documentos"} style={{ marginTop: "1.25rem" }}>
        {generatedDocuments.length === 0 ? (
          <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>Nenhum documento gerado ainda.</p>
        ) : (
          <ul style={{ paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
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
    </>
  );
}
