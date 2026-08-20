import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { JOB_REGISTRY, listJobRuns } from "@/server/jobs";
import { JobsManager } from "./jobs-manager";

const PAGE_SIZE = 20;

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const jobName = params.job ?? "";
  const page = Math.max(1, Number(params.page) || 1);

  const jobRuns = await listJobRuns(context.organizationId, {
    jobName: jobName || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const canRun = hasPermission(context, "job", "CREATE");

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Configurações</div>
          <h1 className="inc-h1">Jobs</h1>
        </div>
      </div>
      <p className="inc-lede">
        Trabalhos em segundo plano do sistema (correção de parcelas, busca de índices no Banco
        Central...). Rodam automaticamente pelo Vercel Cron; use &quot;Executar agora&quot; se um
        cron falhar ou pra rodar fora do horário agendado.
      </p>

      <JobsManager
        jobs={JOB_REGISTRY.map((job) => ({ name: job.name, label: job.label, description: job.description }))}
        jobRuns={jobRuns.items}
        total={jobRuns.total}
        page={page}
        totalPages={Math.max(1, Math.ceil(jobRuns.total / PAGE_SIZE))}
        jobNameFilter={jobName}
        canRun={canRun}
      />
    </>
  );
}
