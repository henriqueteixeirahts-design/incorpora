import "server-only";

import { prisma } from "@/lib/prisma";
import { recalculateAllOpenInstallments } from "@/server/receivables";
import { syncIndexRulesForOrganization } from "@/server/index-rules";
import { runAuditForOrganization } from "@/server/audit";
import { expireReservationsForOrganization } from "@/server/reservations";
import { withOrgContext } from "@/lib/tenant-context";
import { sendJobFailureAlert } from "@/lib/alerts";
import { startOfMonth, monthKey } from "@/lib/index-correction";
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
  /**
   * Checkpoint de retomada, opaco pra jobs.ts — só o próprio job sabe
   * interpretar o formato. `null`/`undefined` = execução concluiu tudo (ou
   * o job não usa checkpoint). Não-nulo = execução esgotou o orçamento de
   * tempo antes de terminar; jobs.ts persiste em `JobRun.cursor` e repassa
   * pra próxima invocação do mesmo job/organização.
   */
  cursor?: string | null;
};

export type JobDefinition = {
  name: string; // chave estável, usada em JobRun.jobName — não renomear job já em produção
  label: string; // nome amigável pra tela de Jobs
  description: string;
  idempotent: true;
  runForOrganization: (
    organizationId: string,
    triggeredBy: JobTrigger,
    cursor?: string | null,
  ) => Promise<JobResult>;
};

// Teto de "travado": bem acima do maxDuration=60s de qualquer rota de cron
// hoje, folgado o bastante pra nunca confundir uma execução lenta porém
// viva com uma órfã de verdade (kill de função serverless sem chance de
// atualizar o próprio status). Ver também a varredura equivalente via
// pg_cron no banco (roda independente do runtime da aplicação, cobre o
// caso em que nenhum job novo é disparado por dias).
const STALE_JOB_RUN_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Varre `JobRun`s órfãos (RUNNING há mais que o teto — sintoma de kill por
 * timeout de função serverless, sem chance de a própria execução marcar
 * FAILURE) e os fecha com um alerta real. Chamada no início de toda
 * execução de job (qualquer um dos 5) — não depende só do cron rodar de
 * novo pra detectar: mesmo um job que nunca mais dispara deixa a
 * organização em `RUNNING` pra sempre sem isso.
 */
async function sweepStaleJobRuns() {
  const staleThreshold = new Date(Date.now() - STALE_JOB_RUN_THRESHOLD_MS);
  const stale = await prisma.jobRun.findMany({
    where: { status: "RUNNING", startedAt: { lt: staleThreshold } },
  });
  if (stale.length === 0) return;

  const error = `Execução travada — sem atualização de status há mais de ${STALE_JOB_RUN_THRESHOLD_MS / 60000} minutos (provável kill por timeout de função serverless). Marcada como falha pelo watchdog.`;

  await prisma.jobRun.updateMany({
    where: { id: { in: stale.map((r) => r.id) } },
    data: { status: "FAILURE", finishedAt: new Date(), error },
  });

  await Promise.all(
    stale.map((jobRun) =>
      sendJobFailureAlert({
        jobName: jobRun.jobName,
        organizationId: jobRun.organizationId,
        jobRunId: jobRun.id,
        error,
      }),
    ),
  );
}

async function runJobForOrganization(
  job: JobDefinition,
  organizationId: string,
  triggeredBy: JobTrigger,
): Promise<JobResult> {
  await sweepStaleJobRuns();

  const previousRunWithCursor = await prisma.jobRun.findFirst({
    where: { jobName: job.name, organizationId, cursor: { not: null } },
    orderBy: { startedAt: "desc" },
    select: { cursor: true },
  });

  const jobRun = await prisma.jobRun.create({
    data: { jobName: job.name, organizationId, triggeredBy, status: "RUNNING" },
  });

  // `.run()`, não `.enterWith()`: esta chamada processa só ESTA
  // organização, mas é uma dentre várias na mesma invocação de
  // `runJobForAllOrganizations` — o contexto não pode vazar pra próxima
  // iteração do loop nem pra continuação de quem chamou depois. Ver
  // src/lib/tenant-context.ts.
  try {
    const result = await withOrgContext(organizationId, () =>
      job.runForOrganization(organizationId, triggeredBy, previousRunWithCursor?.cursor ?? null),
    );
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: result.success ? "SUCCESS" : "FAILURE",
        finishedAt: new Date(),
        summary: result.summary as Prisma.InputJsonValue,
        error: result.error,
        cursor: result.cursor ?? null,
      },
    });
    if (!result.success) {
      await sendJobFailureAlert({
        jobName: job.name,
        organizationId,
        jobRunId: jobRun.id,
        error: result.error ?? "Falha sem mensagem de erro.",
      });
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: "FAILURE", finishedAt: new Date(), error: message },
    });
    await sendJobFailureAlert({ jobName: job.name, organizationId, jobRunId: jobRun.id, error: message });
    return { success: false, summary: {}, error: message };
  }
}

/** Roda o job pra toda organização ativa — o padrão de disparo do cron. Um JobRun por organização. */
export async function runJobForAllOrganizations(job: JobDefinition, triggeredBy: JobTrigger) {
  // `list_active_org_ids()` — função SECURITY DEFINER (RLS Pilar 2, Etapa
  // 3): a única leitura genuinamente cross-tenant do sistema, exposta como
  // função (não como acesso direto à tabela `organizations`) pra manter
  // `app_user` sem nenhum privilégio de bypass. Ver migration
  // 20260916202259_rls_etapa3_list_active_org_ids_function.
  const activeOrgIds = await prisma.$queryRaw<{ id: string }[]>`
    SELECT * FROM list_active_org_ids() AS id
  `;

  const results = [];
  for (const { id: organizationId } of activeOrgIds) {
    const result = await runJobForOrganization(job, organizationId, triggeredBy);
    results.push({ organizationId, ...result });
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
    "Recalcula toda parcela em aberto da organização, aplicando índice de correção e juros/multa por atraso (correção mensal, PRD seção 12). Roda diariamente (teto do plano Hobby da Vercel não permite cron sub-diário) mas só faz trabalho de verdade uma vez por mês de competência — nos demais dias é um no-op, a menos que a execução do mês ainda esteja incompleta (retoma do checkpoint).",
  idempotent: true,
  runForOrganization: async (organizationId, _triggeredBy, cursor) => {
    const now = new Date();
    const currentCompetence = monthKey(now);

    // Já concluído neste mês de competência? Não repete trabalho —
    // condição de no-op exigida pelo cron diário (Vercel Hobby não roda
    // sub-diário, então o mesmo job dispara todo dia; a maioria dos dias
    // deve ser um no-op barato, não um recálculo completo de novo).
    const alreadyCompletedThisMonth = await prisma.jobRun.findFirst({
      where: {
        jobName: "recalculate-installments",
        organizationId,
        status: "SUCCESS",
        cursor: null,
        startedAt: { gte: startOfMonth(now) },
      },
      select: { id: true, startedAt: true },
    });
    if (alreadyCompletedThisMonth) {
      return {
        success: true,
        summary: {
          skipped: true,
          reason: `Competência ${currentCompetence} já concluída em ${alreadyCompletedThisMonth.startedAt.toISOString()}.`,
        },
      };
    }

    // Cursor é uma string opaca pra jobs.ts, mas auto-descritiva pro job:
    // "<competência>:<últimoIdProcessado>". Se veio de um mês de
    // competência diferente do atual (execução do mês passado que nunca
    // completou, ou nunca foi limpa), é tratado como ausente — cada mês
    // começa do zero, nunca retoma o cursor de um mês anterior.
    const [cursorCompetence, cursorInstallmentId] = cursor ? cursor.split(":") : [null, null];
    const resumeAfterId = cursorCompetence === currentCompetence ? cursorInstallmentId : null;

    const result = await recalculateAllOpenInstallments(organizationId, resumeAfterId);
    const nextCursor = result.cursor ? `${currentCompetence}:${result.cursor}` : null;

    return { success: true, summary: result, cursor: nextCursor };
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

async function runAuditJob(organizationId: string, triggeredBy: JobTrigger, full: boolean): Promise<JobResult> {
  const result = await runAuditForOrganization(organizationId, { full, triggeredBy });
  return {
    success: result.status === "OK",
    summary: {
      status: result.status,
      checks: result.checks.map((c) => ({ code: c.code, status: c.status })),
    },
    error: result.status === "ALERT" ? "Uma ou mais verificações da auditoria de atualização falharam — veja o detalhe na tela de Auditoria." : undefined,
  };
}

export const auditUpdateJob: JobDefinition = {
  name: "audit-update",
  label: "Auditoria de atualização (diária, por amostragem)",
  description:
    "Roda as 5 verificações de integridade (frescor de índices, cobertura da correção, consistência da memória por amostragem, execução dos jobs, divergência contra o Banco Central) e atualiza o selo de saúde do dashboard.",
  idempotent: true,
  runForOrganization: (organizationId, triggeredBy) => runAuditJob(organizationId, triggeredBy, false),
};

export const auditUpdateFullJob: JobDefinition = {
  name: "audit-update-full",
  label: "Auditoria de atualização completa (mensal / re-verificação manual)",
  description:
    "Mesmas 5 verificações da auditoria diária, mas a V3 (consistência da memória) confere TODA parcela em aberto, não uma amostra — mais lenta, roda mensalmente e sob demanda (botão \"Re-verificar agora\" na tela de Auditoria).",
  idempotent: true,
  runForOrganization: (organizationId, triggeredBy) => runAuditJob(organizationId, triggeredBy, true),
};

export const expireReservationsJob: JobDefinition = {
  name: "expire-reservations",
  label: "Expirar reservas vencidas",
  description:
    "Expira reservas ativas cujo prazo passou, libera a unidade, e promove o primeiro da fila de espera (se houver) a uma reserva de verdade com prazo de prioridade (docs/ESPEC_MODULO_COMERCIAL.md, Parte 2). Disparado por evento (carregar o espelho/Comercial) até a fila de jobs de verdade entrar em produção.",
  idempotent: true,
  runForOrganization: async (organizationId) => {
    const result = await expireReservationsForOrganization(organizationId);
    return { success: true, summary: result };
  },
};

export const JOB_REGISTRY: JobDefinition[] = [
  recalculateInstallmentsJob,
  syncIndexValuesJob,
  auditUpdateJob,
  auditUpdateFullJob,
  expireReservationsJob,
];

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
