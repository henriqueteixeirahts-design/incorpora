import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getCustomerFinancialPosition } from "@/server/customer-statement";
import { listApplicableDocumentTemplates } from "@/server/document-templates";
import { listRenegotiationGeneratedDocuments } from "@/server/document-generation";
import { getSignedDocumentUrl } from "@/server/storage";
import { listCollectionHistory } from "@/server/collection-log";
import { getCustomerCollectionStage } from "@/server/aging";
import { checkAndUpdateBrokenAgreementsForCustomer, listRenegotiations } from "@/server/renegotiations";
import { StatementView } from "./statement-view";
import type { RenegotiationRow } from "./renegotiation-forms";
import { formatCalendarDateBR, formatDateBR, formatDateTimeBR } from "@/lib/format";

export default async function CustomerStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();
  if (!hasPermission(context, "installment", "VIEW")) notFound();

  // Detecção preguiçosa de "acordo quebrado" (Fase B, Parte 2.2) — mesmo
  // padrão de `listOverdueInstallments`, sem cron (os 2 slots do Hobby já
  // estão ocupados). Roda antes de buscar a posição pra já refletir o
  // estado atualizado na mesma carga da página.
  await checkAndUpdateBrokenAgreementsForCustomer(context.organizationId, id);

  const position = await getCustomerFinancialPosition(context, id);
  if (!position) notFound();

  const developmentIds = Array.from(new Set(position.contracts.map((c) => c.developmentId)));
  const templatesByDevelopmentId: Record<string, { id: string; label: string }[]> = {};
  const renegotiationTemplatesByDevelopmentId: Record<string, { id: string; label: string }[]> = {};
  for (const developmentId of developmentIds) {
    const templates = await listApplicableDocumentTemplates(context.organizationId, developmentId, "STATEMENT");
    templatesByDevelopmentId[developmentId] = templates.map((t) => ({ id: t.id, label: `${t.name} (v${t.version})` }));
    // Não existe um tipo de modelo próprio "Termo de Renegociação" — a spec
    // (Fase B, Parte 2.2, passo 5) já cita "modelo 'Termo de Renegociação'/
    // aditivo", então reaproveita AMENDMENT (o mesmo tipo dos aditivos da
    // Fase A) em vez de criar um enum novo.
    const renegotiationTemplates = await listApplicableDocumentTemplates(context.organizationId, developmentId, "AMENDMENT");
    renegotiationTemplatesByDevelopmentId[developmentId] = renegotiationTemplates.map((t) => ({ id: t.id, label: `${t.name} (v${t.version})` }));
  }

  const [collectionHistory, collectionStage] = await Promise.all([
    listCollectionHistory(context.organizationId, id),
    getCustomerCollectionStage(context, id),
  ]);

  const renegotiationsByContractId: Record<string, RenegotiationRow[]> = {};
  for (const contract of position.contracts) {
    const agreements = await listRenegotiations(context, contract.contractId);
    renegotiationsByContractId[contract.contractId] = await Promise.all(
      agreements.map(async (agreement) => {
        const documents = await listRenegotiationGeneratedDocuments(context.organizationId, agreement.id);
        const documentUrls = await Promise.all(documents.map((doc) => getSignedDocumentUrl(doc.fileUrl).catch(() => null)));
        return {
          id: agreement.id,
          agreementNumber: agreement.agreementNumber,
          status: agreement.status,
          agreementDateLabel: formatCalendarDateBR(agreement.agreementDate),
          consolidatedPrincipal: Number(agreement.consolidatedPrincipal),
          consolidatedCharges: Number(agreement.consolidatedCharges),
          chargesDiscountPercent: Number(agreement.chargesDiscountPercent),
          chargesDiscountAmount: Number(agreement.chargesDiscountAmount),
          downPayment: agreement.downPayment ? Number(agreement.downPayment) : null,
          finalValue: Number(agreement.finalValue),
          applyFutureCorrection: agreement.applyFutureCorrection,
          reason: agreement.reason,
          brokenAtLabel: agreement.brokenAt ? formatDateBR(agreement.brokenAt) : null,
          reactivatedOriginal: agreement.reactivatedOriginal,
          approvals: agreement.approvals.map((a) => ({ level: a.level, decision: a.decision, comment: a.comment })),
          originInstallments: agreement.originInstallments.map((i) => ({
            id: i.id,
            label: i.label,
            dueDateLabel: new Date(i.dueDate).toLocaleDateString("pt-BR"),
            originalValue: Number(i.originalValue),
            status: i.status,
          })),
          destinationInstallments: agreement.destinationInstallments.map((i) => ({
            id: i.id,
            label: i.label,
            dueDateLabel: new Date(i.dueDate).toLocaleDateString("pt-BR"),
            originalValue: Number(i.originalValue),
            status: i.status,
          })),
          generatedDocuments: documents.map((doc, index) => ({
            id: doc.id,
            fileName: doc.fileName,
            uploadedByName: doc.uploadedBy?.fullName ?? "—",
            createdAtLabel: formatDateTimeBR(doc.createdAt),
            downloadUrl: documentUrls[index],
          })),
        };
      }),
    );
  }

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">
            <Link href="/customers">← Clientes</Link>
          </div>
          <h1 className="inc-h1">Extrato — {position.customerName}</h1>
        </div>
      </div>
      <p style={{ marginTop: "-4px", fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)" }}>
        {position.customerDocument}
      </p>

      <StatementView
        position={position}
        templatesByDevelopmentId={templatesByDevelopmentId}
        canRegisterPayment={hasPermission(context, "installment", "CREATE")}
        canGenerateDocument={
          hasPermission(context, "document_template", "VIEW") && hasPermission(context, "document", "CREATE")
        }
        canEditContract={hasPermission(context, "contract", "EDIT")}
        collectionHistory={collectionHistory.map((log) => ({
          id: log.id,
          occurredAtLabel: formatCalendarDateBR(log.occurredAt),
          channel: log.channel,
          summary: log.summary,
          nextStepNote: log.nextStepNote,
        }))}
        collectionStage={
          collectionStage
            ? {
                worstDaysOverdue: collectionStage.worstDaysOverdue,
                currentStep: collectionStage.currentStep,
                nextStep: collectionStage.nextStep,
              }
            : null
        }
        renegotiationsByContractId={renegotiationsByContractId}
        renegotiationTemplatesByDevelopmentId={renegotiationTemplatesByDevelopmentId}
      />
    </>
  );
}
