import { type NextRequest, NextResponse } from "next/server";
import { runJobForAllOrganizations, recalculateInstallmentsJob, auditUpdateFullJob } from "@/server/jobs";

export const maxDuration = 60; // teto do plano Hobby da Vercel — se ficar apertado com o volume real de dados, é o sinal pra migrar pro serviço de fila (Parte 1.3 da especificação)

/**
 * Correção mensal automática (PRD seção 12) — agendada DIARIAMENTE em
 * vercel.json (plano Hobby da Vercel não roda cron sub-diário nem permite
 * garantir um dia exato do mês com precisão — ±59min de imprecisão mesmo
 * em cadência diária). `recalculateInstallmentsJob` decide por conta
 * própria se há trabalho de verdade a fazer: é um no-op na maioria dos
 * dias (competência do mês já concluída) e só processa de verdade uma vez
 * por mês de competência — ou retoma, via `JobRun.cursor`, se a execução
 * anterior esgotou o orçamento de tempo antes de terminar. Rota é só o
 * "chamador" do job (docs/ESPEC_CONFIABILIDADE_JOBS_AUDITORIA.md, Parte 1)
 * — a lógica vive em src/server/jobs.ts e src/server/receivables.ts, cada
 * execução por organização fica registrada em JobRun.
 *
 * Também dispara, só no dia 2 (aproximação do "mês fechou" — mesma janela
 * que a cadência mensal original usava), a auditoria de atualização
 * COMPLETA (Parte 2 da mesma especificação) — verifica toda parcela em
 * aberto, não uma amostra. `auditUpdateFullJob` não tem checkpoint/no-op
 * próprio (é pesada de propósito, não deveria rodar todo dia) — o filtro
 * de data aqui na rota é o que mantém a cadência mensal pretendida mesmo
 * com o cron agora disparando diariamente. Encadeada nesta mesma rota (em
 * vez de um cron próprio) porque o plano Hobby limita o número de cron
 * jobs do projeto. Ver docs/STATUS_IMPLANTACAO.md.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const results = await runJobForAllOrganizations(recalculateInstallmentsJob, "CRON");

  const isMonthlyAuditWindow = new Date().getDate() <= 2;
  const auditResults = isMonthlyAuditWindow ? await runJobForAllOrganizations(auditUpdateFullJob, "CRON") : null;

  return NextResponse.json({
    success: true,
    ranAt: new Date().toISOString(),
    results,
    auditResults,
  });
}
