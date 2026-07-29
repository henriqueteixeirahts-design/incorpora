import "server-only";

import { prisma } from "@/lib/prisma";
import { recalculateAllOpenInstallments } from "@/server/receivables";
import { syncIndexRulesForOrganization } from "@/server/index-rules";
import type { AccessContext } from "@/server/auth-context";
import type { JobTrigger, Prisma } from "@/generated/prisma/client";

/**
 * Contrato de Job (docs/ESPEC_CONFIABILIDADE_JOBS_AUDITORIA.md, Parte 1).
 * Todo trabalho em segundo plano do sistema é escrito como um job nomeado e
 * autônomo — o disparador (cron hoje, fila depois) é só quem chama
 * `runJobForAllOrganizations`/`runJobForOrganization`, sem lógica própria.
 *
 * `idempotent: true` é documental, não verificado em runtime — é a garantia
 * que quem escreve o job assume: rodar duas vezes não pode causar dano
 * (ex.: recalcular parcela já corrigida no mês não corrige de novo).
 */
export type JobResult = {
  success: boolean;
  summary: Record<string, unknown>;
  error?: string;
};

export type JobDefinition = {
  name: string; // chave estável, usada em JobRun.jobName — não renomear job já em produção
  label: string; // nome amigável pra tela de Jobs
  description: string;
  idempotent: true;
  runForOrganization: (organizationId: string) => Promise<JobResult>;
};

async function runJobForOrganization(
  job: JobDefinition,
  organizationId: string,
  triggeredBy: JobTrigger,
): Promise<JobResult> {
  const jobRun = await prisma.jobRun.create({
    data: { jobName: job.name, organizationId, triggeredBy, status: "RUNNING" },
  });

  try {
    const result = await job.runForOrganization(organizationId);
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: result.success ? "SUCCESS" : "FAILURE",
        finishedAt: new Date(),
        summary: result.summary as Prisma.InputJsonValue,
        error: result.error,
      },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: "FAILURE", finishedAt: new Date(), error: message },
    });
    return { success: false, summary: {}, error: message };
  }
}

/** Roda o job pra toda organização ativa — o padrão de disparo do cron. Um JobRun por organização. */
export async function runJobForAllOrganizations(job: JobDefinition, triggeredBy: JobTrigger) {
  const organizations = await prisma.organization.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  const results = [];
  for (const organization of organizations) {
    const result = await runJobForOrganization(job, organization.id, triggeredBy);
    results.push({ organizationId: organization.id, organizationName: organization.name, ...result });
  }
  return results;
}

/** Roda o job pra uma única organização — usado pelo "Executar agora" da tela de Jobs. */
export function runJobForSingleOrganization(job: JobDefinition, organizationId: string, triggeredBy: JobTrigger) {
  return runJobForOrganization(job, organizationId, triggeredBy);
}

export const recalculateInstallmentsJob: JobDefinition = {
  name: "recalculate-installments",
  label: "Recalcular parcelas em aberto",
  description:
    "Recalcula toda parcela em aberto da organização, aplicando índice de correção e juros/multa por atraso (correção mensal, PRD seção 12).",
  idempotent: true,
  runForOrganization: async (organizationId) => {
    const result = await recalculateAllOpenInstallments(organizationId);
    return { success: true, summary: result };
  },
};

export const syncIndexValuesJob: JobDefinition = {
  name: "sync-index-values",
  label: "Buscar índices no Banco Central",
  description:
    "Busca os valores oficiais de INCC/IPCA/IGP-M publicados pelo Banco Central (SGS) e preenche os meses em aberto da organização, sem sobrescrever lançamento manual.",
  idempotent: true,
  runForOrganization: async (organizationId) => {
    const results = await syncIndexRulesForOrganization(organizationId);
    return { success: true, summary: { rules: results } };
  },
};

export const JOB_REGISTRY: JobDefinition[] = [recalculateInstallmentsJob, syncIndexValuesJob];

export function getJobByName(name: string) {
  return JOB_REGISTRY.find((job) => job.name === name);
}

/**
 * Dispara um job do catálogo pra organização da sessão — a "válvula de
 * escape operacional" da tela de Jobs (Configurações → Sistema → Jobs):
 * se o cron falhar, roda na mão em 1 clique, sempre escopado pela
 * organização de quem está logado (nunca por parâmetro do cliente).
 */
export async function runJobManually(context: AccessContext, jobName: string) {
  const job = getJobByName(jobName);
  if (!job) throw new Error("Job não encontrado.");
  return runJobForSingleOrganization(job, context.organizationId, "MANUAL");
}

export type JobRunSortField = "startedAt";

export async function listJobRuns(
  organizationId: string,
  params: { jobName?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;

  const where: Prisma.JobRunWhereInput = {
    organizationId,
    ...(params.jobName ? { jobName: params.jobName } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.jobRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.jobRun.count({ where }),
  ]);

  return { items, total, page, pageSize };
}
