import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listAuditRuns } from "@/server/audit";
import { AuditManager } from "./audit-manager";

const PAGE_SIZE = 20;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const page = Math.max(1, Number(params.page) || 1);
  const auditRuns = await listAuditRuns(context.organizationId, { page, pageSize: PAGE_SIZE });

  const canRun = hasPermission(context, "audit", "CREATE");

  return (
    <>
      <h1>Auditoria de atualização</h1>
      <p style={{ opacity: 0.7, maxWidth: 680, marginTop: "0.5rem" }}>
        O double-check independente do motor de correção: 5 verificações que conferem se os índices
        estão em dia, se toda parcela foi recalculada no ciclo, se o valor calculado bate com um
        recálculo por caminho de código separado, se os jobs agendados rodaram, e se o índice
        gravado bate com a fonte oficial do Banco Central. Roda automaticamente e sob demanda.
      </p>

      <AuditManager
        auditRuns={auditRuns.items}
        total={auditRuns.total}
        page={page}
        totalPages={Math.max(1, Math.ceil(auditRuns.total / PAGE_SIZE))}
        canRun={canRun}
      />
    </>
  );
}
