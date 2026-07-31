"use client";

import { useState, type ReactNode } from "react";
import { Tabs, type TabDef } from "@/components/Tabs";
import { CreateContractForm, MarkAwaitingSignatureForm, ConfirmSignatureForm } from "./contract-forms";
import { CorrectionRuleForm } from "./correction-rule-form";
import { DownPaymentDestinationForm } from "./down-payment-destination-form";
import { RegisterPaymentForm, RecalculatePortfolioButton } from "./payment-form";
import { AnticipationForm } from "./anticipation-form";
import { GenerateDocumentForm } from "./generate-document-form";

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

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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

export type CommissionSplitRow = {
  id: string;
  beneficiaryType: string;
  label: string | null;
  percent: number;
  value: number;
  status: string;
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
}: {
  saleId: string;
  /** Server Component pré-renderizado no page.tsx — não dá pra importar/renderizar Server Component de dentro de um Client Component. */
  indexFreshnessBanner: ReactNode;
  contract: { id: string; status: string; signedDocumentPath: string | null } | null;
  timeline: TimelineEventRow[];
  paymentFlowItems: PaymentFlowItemRow[];
  installments: InstallmentRow[];
  portfolioTotalValue: number | null;
  portfolioId: string | null;
  openInstallments: { id: string; label: string; dueDate: string }[];
  applicableTemplates: { id: string; label: string }[];
  generatedDocuments: GeneratedDocumentRow[];
  commissionSplits: CommissionSplitRow[];
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
          </>
        )}
      </div>

      <div hidden={activeTab !== "comissoes"} style={{ marginTop: "1.25rem" }}>
        {commissionSplits.length === 0 ? (
          <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>Nenhuma comissão lançada.</p>
        ) : (
          <table style={{ maxWidth: 700 }}>
            <thead>
              <tr>
                <th>Beneficiário</th>
                <th>%</th>
                <th>Valor</th>
                <th>Status</th>
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
                  <td>{split.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: "0.8rem", opacity: 0.6, marginTop: "0.75rem" }}>
          Regra de liberação por parcela e extrato consolidado por corretor/imobiliária chegam na
          etapa 3 da Fase A.
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
