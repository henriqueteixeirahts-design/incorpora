import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getCustomerFinancialPosition } from "@/server/customer-statement";
import { listApplicableDocumentTemplates } from "@/server/document-templates";
import { listCollectionHistory } from "@/server/collection-log";
import { getCustomerCollectionStage } from "@/server/aging";
import { StatementView } from "./statement-view";

export default async function CustomerStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();
  if (!hasPermission(context, "installment", "VIEW")) notFound();

  const position = await getCustomerFinancialPosition(context.organizationId, id);
  if (!position) notFound();

  const developmentIds = Array.from(new Set(position.contracts.map((c) => c.developmentId)));
  const templatesByDevelopmentId: Record<string, { id: string; label: string }[]> = {};
  for (const developmentId of developmentIds) {
    const templates = await listApplicableDocumentTemplates(context.organizationId, developmentId, "STATEMENT");
    templatesByDevelopmentId[developmentId] = templates.map((t) => ({ id: t.id, label: `${t.name} (v${t.version})` }));
  }

  const [collectionHistory, collectionStage] = await Promise.all([
    listCollectionHistory(context.organizationId, id),
    getCustomerCollectionStage(context.organizationId, id),
  ]);

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href="/customers">← Clientes</Link>
      </p>
      <h1>Extrato — {position.customerName}</h1>
      <p style={{ opacity: 0.7 }}>{position.customerDocument}</p>

      <StatementView
        position={position}
        templatesByDevelopmentId={templatesByDevelopmentId}
        canRegisterPayment={hasPermission(context, "installment", "CREATE")}
        canGenerateDocument={
          hasPermission(context, "document_template", "VIEW") && hasPermission(context, "document", "CREATE")
        }
        collectionHistory={collectionHistory.map((log) => ({
          id: log.id,
          occurredAtLabel: new Date(log.occurredAt).toLocaleDateString("pt-BR"),
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
      />
    </>
  );
}
