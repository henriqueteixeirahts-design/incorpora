import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getSale } from "@/server/sales";
import { getContractBySale } from "@/server/contracts";
import { getSignedContractUrl, getSignedDocumentUrl } from "@/server/storage";
import { listIndexRules } from "@/server/index-rules";
import { listApplicableDocumentTemplates } from "@/server/document-templates";
import { listGeneratedDocuments } from "@/server/document-generation";
import type { PaymentFlowResult } from "@/lib/payment-flow";
import { CreateContractForm, MarkAwaitingSignatureForm, ConfirmSignatureForm } from "./contract-forms";
import { CorrectionRuleForm } from "./correction-rule-form";
import { DownPaymentDestinationForm } from "./down-payment-destination-form";
import { RegisterPaymentForm, RecalculatePortfolioButton } from "./payment-form";
import { AnticipationForm } from "./anticipation-form";
import { GenerateDocumentForm } from "./generate-document-form";
import { IndexFreshnessBanner } from "@/components/IndexFreshnessBanner";

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

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const sale = await getSale(context.organizationId, id);
  if (!sale) notFound();

  const contract = await getContractBySale(context.organizationId, id);
  const indexRules = contract ? await listIndexRules(context.organizationId) : [];
  const signedDocumentUrl = contract?.signedDocumentPath
    ? await getSignedContractUrl(contract.signedDocumentPath).catch(() => null)
    : null;

  const canCreateContract = hasPermission(context, "contract", "CREATE");
  const canEditContract = hasPermission(context, "contract", "EDIT");
  const canRegisterPayment = hasPermission(context, "installment", "CREATE");
  const canRecalculate = hasPermission(context, "installment", "EDIT");
  const canGenerateDocument =
    hasPermission(context, "document_template", "VIEW") && hasPermission(context, "document", "CREATE");

  const applicableTemplates = contract
    ? await listApplicableDocumentTemplates(context.organizationId, sale.developmentId, "SALES_CONTRACT")
    : [];
  const generatedDocuments = contract
    ? await listGeneratedDocuments(context.organizationId, contract.id)
    : [];
  const generatedDocumentUrls = await Promise.all(
    generatedDocuments.map((doc) => getSignedDocumentUrl(doc.fileUrl).catch(() => null)),
  );

  const paymentFlow = sale.proposal.paymentFlow as unknown as PaymentFlowResult | null;
  const openInstallments = contract?.portfolio?.installments.filter(
    (i) => i.status !== "PAID" && i.status !== "CANCELLED",
  );

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href="/sales">← Vendas</Link>
      </p>
      <h1>
        {sale.development.name} — {sale.unit.number}
      </h1>
      <p style={{ opacity: 0.7 }}>
        {sale.customer.name} · {formatCurrency(Number(sale.salePrice))} em{" "}
        {new Date(sale.saleDate).toLocaleDateString("pt-BR")}
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Contrato</h2>

        {!contract ? (
          canCreateContract ? (
            <div style={{ marginTop: "0.75rem" }}>
              <CreateContractForm saleId={id} />
            </div>
          ) : (
            <p style={{ opacity: 0.7 }}>Nenhum contrato gerado ainda.</p>
          )
        ) : (
          <div
            style={{
              border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
              borderRadius: 8,
              padding: "1rem",
              marginTop: "0.75rem",
              maxWidth: 700,
            }}
          >
            <p>
              <strong>{contract.contractNumber}</strong> —{" "}
              {CONTRACT_STATUS_LABELS[contract.status]}
            </p>
            <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
              Gerado em {new Date(contract.issuedAt).toLocaleDateString("pt-BR")}
              {contract.signedAt
                ? ` · assinado em ${new Date(contract.signedAt).toLocaleDateString("pt-BR")}`
                : ""}
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

            <details style={{ marginTop: "0.75rem" }}>
              <summary>Minuta</summary>
              <div style={{ fontSize: "0.85rem", marginTop: "0.5rem", lineHeight: 1.6 }}>
                <p>
                  <strong>Contrato de Compra e Venda</strong> nº {contract.contractNumber}
                </p>
                <p>
                  Incorporadora: {sale.organization.name} — SPE: {sale.development.spe.name} (
                  {sale.development.spe.document})
                </p>
                <p>Empreendimento: {sale.development.name}</p>
                <p>Unidade: {sale.unit.number}</p>
                <p>Comprador: {sale.customer.name} — {sale.customer.document}</p>
                <p>Valor da venda: {formatCurrency(Number(sale.salePrice))}</p>
                {sale.proposal.broker ? <p>Corretor: {sale.proposal.broker.name}</p> : null}
                {sale.proposal.agency ? <p>Imobiliária: {sale.proposal.agency.name}</p> : null}
                {paymentFlow ? (
                  <>
                    <p style={{ marginTop: "0.5rem" }}>Fluxo de pagamento:</p>
                    <ul>
                      {paymentFlow.items.map((item, index) => (
                        <li key={index}>
                          {item.label}: {formatCurrency(item.amount)} (mês {item.dueOffsetMonths})
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </details>

            {canGenerateDocument ? (
              <div style={{ marginTop: "0.75rem" }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 500 }}>Gerar documento</p>
                <GenerateDocumentForm
                  saleId={id}
                  contractId={contract.id}
                  templates={applicableTemplates.map((t) => ({ id: t.id, label: `${t.name} (v${t.version})` }))}
                />
              </div>
            ) : null}

            {generatedDocuments.length > 0 ? (
              <div style={{ marginTop: "0.75rem" }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 500 }}>Documentos gerados</p>
                <ul style={{ paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
                  {generatedDocuments.map((doc, index) => (
                    <li key={doc.id}>
                      {doc.fileName} — v{doc.documentTemplateVersion} — {doc.uploadedBy?.fullName ?? "—"} em{" "}
                      {new Date(doc.createdAt).toLocaleString("pt-BR")}
                      {generatedDocumentUrls[index] ? (
                        <>
                          {" "}
                          —{" "}
                          <a href={generatedDocumentUrls[index]!} target="_blank" rel="noreferrer">
                            Baixar
                          </a>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              {canEditContract && contract.status === "DRAFT" ? (
                <MarkAwaitingSignatureForm saleId={id} contractId={contract.id} />
              ) : null}
            </div>

            {canEditContract && contract.status === "AWAITING_SIGNATURE" ? (
              <div style={{ marginTop: "0.75rem" }}>
                <ConfirmSignatureForm saleId={id} contractId={contract.id} />
              </div>
            ) : null}
          </div>
        )}
      </section>

      {(!contract || contract.status !== "SIGNED") && hasPermission(context, "sale", "EDIT") ? (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>Destino da entrada</h2>
          <p style={{ fontSize: "0.85rem", opacity: 0.7, maxWidth: 500 }}>
            Só pode ser alterado antes da assinatura — a carteira é montada com o destino vigente
            nesse momento.
          </p>
          <div style={{ marginTop: "0.75rem" }}>
            <DownPaymentDestinationForm
              saleId={id}
              tableDefault={sale.proposal.salesTable?.downPaymentDestination ?? null}
              override={sale.downPaymentDestinationOverride}
            />
          </div>
        </section>
      ) : null}

      {contract && canEditContract ? (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>Regra de correção — fase de obra</h2>
          <p style={{ fontSize: "0.85rem", opacity: 0.7, maxWidth: 500 }}>
            Índice, juros adicionais e multa/mora usados até o Habite-se do empreendimento. A
            regra de correção pós-Habite-se é configurada no cadastro do empreendimento (mesma
            para todos os contratos dele) — veja a página do empreendimento.
          </p>
          <div style={{ marginTop: "0.75rem" }}>
            <CorrectionRuleForm
              saleId={id}
              contractId={contract.id}
              indexRules={indexRules.map((r) => ({ id: r.id, name: r.name }))}
              current={{
                indexRuleId: contract.indexRuleId,
                monthlyInterestPercent: contract.monthlyInterestPercent
                  ? Number(contract.monthlyInterestPercent)
                  : null,
                interestType: contract.interestType,
                latePaymentFinePercent: Number(contract.latePaymentFinePercent),
                latePaymentMonthlyInterestPercent: Number(
                  contract.latePaymentMonthlyInterestPercent,
                ),
              }}
            />
          </div>
        </section>
      ) : null}

      {contract?.portfolio ? (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>Carteira</h2>
          <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
            Total nominal: {formatCurrency(Number(contract.portfolio.totalValue))}
          </p>

          <IndexFreshnessBanner organizationId={context.organizationId} />

          {canRecalculate ? (
            <div style={{ marginTop: "0.5rem" }}>
              <RecalculatePortfolioButton saleId={id} portfolioId={contract.portfolio.id} />
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
              {contract.portfolio.installments.map((installment) => (
                <tr key={installment.id}>
                  <td>{installment.sequence}</td>
                  <td>{installment.label}</td>
                  <td>{new Date(installment.dueDate).toLocaleDateString("pt-BR")}</td>
                  <td>{formatCurrency(Number(installment.originalValue))}</td>
                  <td>
                    {installment.correctedValue
                      ? formatCurrency(Number(installment.correctedValue))
                      : "—"}
                  </td>
                  <td>{formatCurrency(Number(installment.paidAmount))}</td>
                  <td>{INSTALLMENT_STATUS_LABELS[installment.status]}</td>
                  {canRegisterPayment ? (
                    <td>
                      {installment.status !== "PAID" && installment.status !== "CANCELLED" ? (
                        <RegisterPaymentForm saleId={id} installmentId={installment.id} />
                      ) : (
                        "—"
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {openInstallments && openInstallments.length > 0 ? (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>Simular antecipação</h2>
          <div style={{ marginTop: "0.75rem" }}>
            <AnticipationForm
              installments={openInstallments.map((i) => ({
                id: i.id,
                label: i.label,
                dueDate: new Date(i.dueDate).toLocaleDateString("pt-BR"),
              }))}
            />
          </div>
        </section>
      ) : null}
    </>
  );
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
