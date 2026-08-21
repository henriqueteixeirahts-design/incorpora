import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getSale } from "@/server/sales";
import { getContractBySale } from "@/server/contracts";
import { getSignedContractUrl, getSignedDocumentUrl } from "@/server/storage";
import { listIndexRules } from "@/server/index-rules";
import { listApplicableDocumentTemplates } from "@/server/document-templates";
import {
  listGeneratedDocuments,
  listAmendmentGeneratedDocuments,
  listAssignmentGeneratedDocuments,
  listDistratoGeneratedDocuments,
} from "@/server/document-generation";
import { listSaleTimeline } from "@/server/sale-timeline";
import { listAmendments, getRemainingBalance } from "@/server/contract-amendments";
import { listAssignments } from "@/server/contract-assignments";
import { getDistratoByContract } from "@/server/contract-distratos";
import { getEffectiveDistratoRule } from "@/server/distrato-rules";
import { listCustomers } from "@/server/crm";
import type { PaymentFlowResult } from "@/lib/payment-flow";
import { SaleDetailTabs } from "./sale-detail-tabs";
import { IndexFreshnessBanner } from "@/components/IndexFreshnessBanner";
import { formatCurrencyBRL, formatDateBR, formatDateTimeBR, formatCalendarDateBR } from "@/lib/format";

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const sale = await getSale(context, id);
  if (!sale) notFound();

  const contract = await getContractBySale(context, id);
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
    contract && contract.status === "SIGNED" ? await listAmendments(context, contract.id) : [];
  const amendmentTemplates =
    contract && contract.status === "SIGNED"
      ? await listApplicableDocumentTemplates(context.organizationId, sale.developmentId, "AMENDMENT")
      : [];
  const remainingBalance =
    contract && contract.status === "SIGNED" ? await getRemainingBalance(context, contract.id) : 0;

  const amendmentDocuments = await Promise.all(
    amendments.map((amendment) => listAmendmentGeneratedDocuments(context.organizationId, amendment.id)),
  );
  const amendmentDocumentUrls = await Promise.all(
    amendmentDocuments.map((docs) => Promise.all(docs.map((doc) => getSignedDocumentUrl(doc.fileUrl).catch(() => null)))),
  );

  const assignments =
    contract && contract.status === "SIGNED" ? await listAssignments(context, contract.id) : [];
  const assignmentTemplates =
    contract && contract.status === "SIGNED"
      ? await listApplicableDocumentTemplates(context.organizationId, sale.developmentId, "ASSIGNMENT")
      : [];
  const allCustomers = contract && contract.status === "SIGNED" ? await listCustomers(context.organizationId) : [];

  const assignmentDocuments = await Promise.all(
    assignments.map((assignment) => listAssignmentGeneratedDocuments(context.organizationId, assignment.id)),
  );
  const assignmentDocumentUrls = await Promise.all(
    assignmentDocuments.map((docs) => Promise.all(docs.map((doc) => getSignedDocumentUrl(doc.fileUrl).catch(() => null)))),
  );

  const distrato = contract ? await getDistratoByContract(context, contract.id) : null;
  const distratoTemplates = contract
    ? await listApplicableDocumentTemplates(context.organizationId, sale.developmentId, "RESCISSION")
    : [];
  const distratoRule = contract ? await getEffectiveDistratoRule(context.organizationId, sale.developmentId) : null;
  const distratoDocuments = distrato ? await listDistratoGeneratedDocuments(context.organizationId, distrato.id) : [];
  const distratoDocumentUrls = await Promise.all(
    distratoDocuments.map((doc) => getSignedDocumentUrl(doc.fileUrl).catch(() => null)),
  );

  const paymentFlow = (sale.proposal.proposedPaymentFlow ??
    sale.proposal.paymentFlow) as unknown as PaymentFlowResult | null;
  const openInstallments = contract?.portfolio?.installments.filter(
    (i) => i.status !== "PAID" && i.status !== "CANCELLED",
  );

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">
            <Link href="/sales">← Vendas</Link>
          </div>
          <h1 className="inc-h1">
            {sale.saleNumber} — {sale.development.name} — {sale.unit.number}
          </h1>
        </div>
      </div>
      <p style={{ marginTop: "-4px", fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)" }}>
        {sale.customer.name} · {formatCurrency(Number(sale.salePrice))} em{" "}
        {formatDateBR(sale.saleDate)}
      </p>

      <div style={{ marginTop: "1.5rem" }}>
        <SaleDetailTabs
          saleId={id}
          indexFreshnessBanner={<IndexFreshnessBanner organizationId={context.organizationId} />}
          contract={
            contract
              ? {
                  id: contract.id,
                  status: contract.status,
                  signedDocumentPath: contract.signedDocumentPath,
                  customerName: contract.customer.name,
                }
              : null
          }
          timeline={timelineEvents.map((event) => ({
            id: event.id,
            label: event.label,
            occurredAtLabel: formatDateTimeBR(event.occurredAt),
            actorName: event.actorName,
          }))}
          paymentFlowItems={paymentFlow?.items ?? []}
          installments={
            contract?.portfolio?.installments.map((installment) => ({
              id: installment.id,
              sequence: installment.sequence,
              label: installment.label,
              dueDateLabel: formatCalendarDateBR(installment.dueDate),
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
              dueDate: formatCalendarDateBR(i.dueDate),
            })) ?? []
          }
          applicableTemplates={applicableTemplates.map((t) => ({ id: t.id, label: `${t.name} (v${t.version})` }))}
          generatedDocuments={generatedDocuments.map((doc, index) => ({
            id: doc.id,
            fileName: doc.fileName,
            templateVersion: doc.documentTemplateVersion,
            uploadedByName: doc.uploadedBy?.fullName ?? "—",
            createdAtLabel: formatDateTimeBR(doc.createdAt),
            downloadUrl: generatedDocumentUrls[index],
          }))}
          commissionSplits={sale.commissionSplits.map((split) => ({
            id: split.id,
            beneficiaryType: split.beneficiaryType,
            label: split.label,
            percent: Number(split.percent),
            value: Number(split.value),
            status: split.status,
            releasedAtLabel: split.releasedAt ? formatDateBR(split.releasedAt) : null,
            paidAtLabel: split.paidAt ? formatDateBR(split.paidAt) : null,
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
          contractIssuedAtLabel={contract ? formatDateBR(contract.issuedAt) : null}
          contractSignedAtLabel={contract?.signedAt ? formatDateBR(contract.signedAt) : null}
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
            createdAtLabel: formatDateBR(amendment.createdAt),
            signedAtLabel: amendment.signedAt ? formatDateBR(amendment.signedAt) : null,
            proposedFlowItems: amendment.proposedPaymentFlow
              ? (amendment.proposedPaymentFlow as unknown as PaymentFlowResult).items
              : null,
            generatedDocuments: amendmentDocuments[index].map((doc, docIndex) => ({
              id: doc.id,
              fileName: doc.fileName,
              templateVersion: doc.documentTemplateVersion,
              uploadedByName: doc.uploadedBy?.fullName ?? "—",
              createdAtLabel: formatDateTimeBR(doc.createdAt),
              downloadUrl: amendmentDocumentUrls[index][docIndex],
            })),
          }))}
          amendmentTemplates={amendmentTemplates.map((t) => ({ id: t.id, label: `${t.name} (v${t.version})` }))}
          remainingBalance={remainingBalance}
          assignments={assignments.map((assignment, index) => ({
            id: assignment.id,
            assignmentNumber: assignment.assignmentNumber,
            status: assignment.status,
            notes: assignment.notes,
            assignmentDateLabel: formatCalendarDateBR(assignment.assignmentDate),
            feeAmount: assignment.feeAmount ? Number(assignment.feeAmount) : null,
            createdAtLabel: formatDateBR(assignment.createdAt),
            signedAtLabel: assignment.signedAt ? formatDateBR(assignment.signedAt) : null,
            previousCustomerName: assignment.previousCustomer.name,
            newCustomerName: assignment.newCustomer.name,
            generatedDocuments: assignmentDocuments[index].map((doc, docIndex) => ({
              id: doc.id,
              fileName: doc.fileName,
              templateVersion: doc.documentTemplateVersion,
              uploadedByName: doc.uploadedBy?.fullName ?? "—",
              createdAtLabel: formatDateTimeBR(doc.createdAt),
              downloadUrl: assignmentDocumentUrls[index][docIndex],
            })),
          }))}
          assignmentTemplates={assignmentTemplates.map((t) => ({ id: t.id, label: `${t.name} (v${t.version})` }))}
          customers={allCustomers.map((c) => ({ id: c.id, label: `${c.name} (${c.document})` }))}
          distrato={
            distrato
              ? {
                  id: distrato.id,
                  distratoNumber: distrato.distratoNumber,
                  status: distrato.status,
                  totalPaid: Number(distrato.totalPaid),
                  retentionPercent: Number(distrato.retentionPercent),
                  retentionAmount: Number(distrato.retentionAmount),
                  brokerageDeductionAmount: distrato.brokerageDeductionAmount ? Number(distrato.brokerageDeductionAmount) : null,
                  occupancyFeeAmount: distrato.occupancyFeeAmount ? Number(distrato.occupancyFeeAmount) : null,
                  refundAmount: Number(distrato.refundAmount),
                  refundDueDateLabel: formatCalendarDateBR(distrato.refundDueDate),
                  refundTerms: distrato.refundTerms,
                  reason: distrato.reason,
                  createdAtLabel: formatDateBR(distrato.createdAt),
                  signedAtLabel: distrato.signedAt ? formatDateBR(distrato.signedAt) : null,
                  refundPayableId: distrato.refundPayableId,
                  generatedDocuments: distratoDocuments.map((doc, docIndex) => ({
                    id: doc.id,
                    fileName: doc.fileName,
                    templateVersion: doc.documentTemplateVersion,
                    uploadedByName: doc.uploadedBy?.fullName ?? "—",
                    createdAtLabel: formatDateTimeBR(doc.createdAt),
                    downloadUrl: distratoDocumentUrls[docIndex],
                  })),
                }
              : null
          }
          distratoTemplates={distratoTemplates.map((t) => ({ id: t.id, label: `${t.name} (v${t.version})` }))}
          distratoRetentionPercent={distratoRule?.retentionPercent ?? 25}
        />
      </div>
    </>
  );
}

const formatCurrency = formatCurrencyBRL;
