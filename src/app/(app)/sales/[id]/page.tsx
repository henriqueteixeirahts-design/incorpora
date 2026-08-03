import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getSale } from "@/server/sales";
import { getContractBySale } from "@/server/contracts";
import { getSignedContractUrl, getSignedDocumentUrl } from "@/server/storage";
import { listIndexRules } from "@/server/index-rules";
import { listApplicableDocumentTemplates } from "@/server/document-templates";
import { listGeneratedDocuments, listAmendmentGeneratedDocuments } from "@/server/document-generation";
import { listSaleTimeline } from "@/server/sale-timeline";
import { listAmendments, getRemainingBalance } from "@/server/contract-amendments";
import type { PaymentFlowResult } from "@/lib/payment-flow";
import { SaleDetailTabs } from "./sale-detail-tabs";
import { IndexFreshnessBanner } from "@/components/IndexFreshnessBanner";

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
  const canEditSale = hasPermission(context, "sale", "EDIT");

  const applicableTemplates = contract
    ? await listApplicableDocumentTemplates(context.organizationId, sale.developmentId, "SALES_CONTRACT")
    : [];
  const generatedDocuments = contract
    ? await listGeneratedDocuments(context.organizationId, contract.id)
    : [];
  const generatedDocumentUrls = await Promise.all(
    generatedDocuments.map((doc) => getSignedDocumentUrl(doc.fileUrl).catch(() => null)),
  );

  const timelineEvents = await listSaleTimeline(
    context.organizationId,
    { id: sale.id, proposalId: sale.proposalId, reservationId: sale.reservationId },
    contract,
  );

  const amendments =
    contract && contract.status === "SIGNED" ? await listAmendments(context.organizationId, contract.id) : [];
  const amendmentTemplates =
    contract && contract.status === "SIGNED"
      ? await listApplicableDocumentTemplates(context.organizationId, sale.developmentId, "AMENDMENT")
      : [];
  const remainingBalance =
    contract && contract.status === "SIGNED" ? await getRemainingBalance(context.organizationId, contract.id) : 0;

  const amendmentDocuments = await Promise.all(
    amendments.map((amendment) => listAmendmentGeneratedDocuments(context.organizationId, amendment.id)),
  );
  const amendmentDocumentUrls = await Promise.all(
    amendmentDocuments.map((docs) => Promise.all(docs.map((doc) => getSignedDocumentUrl(doc.fileUrl).catch(() => null)))),
  );

  const paymentFlow = (sale.proposal.proposedPaymentFlow ??
    sale.proposal.paymentFlow) as unknown as PaymentFlowResult | null;
  const openInstallments = contract?.portfolio?.installments.filter(
    (i) => i.status !== "PAID" && i.status !== "CANCELLED",
  );

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href="/sales">← Vendas</Link>
      </p>
      <h1>
        {sale.saleNumber} — {sale.development.name} — {sale.unit.number}
      </h1>
      <p style={{ opacity: 0.7 }}>
        {sale.customer.name} · {formatCurrency(Number(sale.salePrice))} em{" "}
        {new Date(sale.saleDate).toLocaleDateString("pt-BR")}
      </p>

      <div style={{ marginTop: "1.5rem" }}>
        <SaleDetailTabs
          saleId={id}
          indexFreshnessBanner={<IndexFreshnessBanner organizationId={context.organizationId} />}
          contract={
            contract ? { id: contract.id, status: contract.status, signedDocumentPath: contract.signedDocumentPath } : null
          }
          timeline={timelineEvents.map((event) => ({
            id: event.id,
            label: event.label,
            occurredAtLabel: new Date(event.occurredAt).toLocaleString("pt-BR"),
          }))}
          paymentFlowItems={paymentFlow?.items ?? []}
          installments={
            contract?.portfolio?.installments.map((installment) => ({
              id: installment.id,
              sequence: installment.sequence,
              label: installment.label,
              dueDateLabel: new Date(installment.dueDate).toLocaleDateString("pt-BR"),
              originalValue: Number(installment.originalValue),
              correctedValue: installment.correctedValue ? Number(installment.correctedValue) : null,
              paidAmount: Number(installment.paidAmount),
              status: installment.status,
            })) ?? []
          }
          portfolioTotalValue={contract?.portfolio ? Number(contract.portfolio.totalValue) : null}
          portfolioId={contract?.portfolio?.id ?? null}
          openInstallments={
            openInstallments?.map((i) => ({
              id: i.id,
              label: i.label,
              dueDate: new Date(i.dueDate).toLocaleDateString("pt-BR"),
            })) ?? []
          }
          applicableTemplates={applicableTemplates.map((t) => ({ id: t.id, label: `${t.name} (v${t.version})` }))}
          generatedDocuments={generatedDocuments.map((doc, index) => ({
            id: doc.id,
            fileName: doc.fileName,
            templateVersion: doc.documentTemplateVersion,
            uploadedByName: doc.uploadedBy?.fullName ?? "—",
            createdAtLabel: new Date(doc.createdAt).toLocaleString("pt-BR"),
            downloadUrl: generatedDocumentUrls[index],
          }))}
          commissionSplits={sale.commissionSplits.map((split) => ({
            id: split.id,
            beneficiaryType: split.beneficiaryType,
            label: split.label,
            percent: Number(split.percent),
            value: Number(split.value),
            status: split.status,
            releasedAtLabel: split.releasedAt ? new Date(split.releasedAt).toLocaleDateString("pt-BR") : null,
            paidAtLabel: split.paidAt ? new Date(split.paidAt).toLocaleDateString("pt-BR") : null,
          }))}
          downPaymentAbatement={
            (() => {
              const event = timelineEvents.find((e) => e.eventType === "contract.down_payment_as_commission");
              if (!event) return null;
              const payload = event.payload as { downPaymentTotal?: number; commissionExcess?: number } | null;
              if (!payload?.downPaymentTotal) return null;
              return { downPaymentTotal: payload.downPaymentTotal, commissionExcess: payload.commissionExcess ?? null };
            })()
          }
          saleTotal={Number(sale.salePrice)}
          proposalBrokerName={sale.proposal.broker?.name ?? null}
          proposalAgencyName={sale.proposal.agency?.name ?? null}
          signedDocumentUrl={signedDocumentUrl}
          indexRules={indexRules.map((r) => ({ id: r.id, name: r.name }))}
          correctionCurrent={
            contract
              ? {
                  indexRuleId: contract.indexRuleId,
                  monthlyInterestPercent: contract.monthlyInterestPercent
                    ? Number(contract.monthlyInterestPercent)
                    : null,
                  interestType: contract.interestType,
                  latePaymentFinePercent: Number(contract.latePaymentFinePercent),
                  latePaymentMonthlyInterestPercent: Number(contract.latePaymentMonthlyInterestPercent),
                }
              : null
          }
          downPaymentTableDefault={sale.proposal.salesTable?.downPaymentDestination ?? null}
          downPaymentOverride={sale.downPaymentDestinationOverride}
          contractNumber={contract?.contractNumber ?? null}
          contractIssuedAtLabel={contract ? new Date(contract.issuedAt).toLocaleDateString("pt-BR") : null}
          contractSignedAtLabel={contract?.signedAt ? new Date(contract.signedAt).toLocaleDateString("pt-BR") : null}
          canCreateContract={canCreateContract}
          canEditContract={canEditContract}
          canRegisterPayment={canRegisterPayment}
          canRecalculate={canRecalculate}
          canGenerateDocument={canGenerateDocument}
          canEditSale={canEditSale}
          amendments={amendments.map((amendment, index) => ({
            id: amendment.id,
            amendmentNumber: amendment.amendmentNumber,
            type: amendment.type,
            status: amendment.status,
            notes: amendment.notes,
            createdAtLabel: new Date(amendment.createdAt).toLocaleDateString("pt-BR"),
            signedAtLabel: amendment.signedAt ? new Date(amendment.signedAt).toLocaleDateString("pt-BR") : null,
            proposedFlowItems: amendment.proposedPaymentFlow
              ? (amendment.proposedPaymentFlow as unknown as PaymentFlowResult).items
              : null,
            generatedDocuments: amendmentDocuments[index].map((doc, docIndex) => ({
              id: doc.id,
              fileName: doc.fileName,
              templateVersion: doc.documentTemplateVersion,
              uploadedByName: doc.uploadedBy?.fullName ?? "—",
              createdAtLabel: new Date(doc.createdAt).toLocaleString("pt-BR"),
              downloadUrl: amendmentDocumentUrls[index][docIndex],
            })),
          }))}
          amendmentTemplates={amendmentTemplates.map((t) => ({ id: t.id, label: `${t.name} (v${t.version})` }))}
          remainingBalance={remainingBalance}
        />
      </div>
    </>
  );
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
