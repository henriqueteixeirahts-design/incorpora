import { type NextRequest, NextResponse } from "next/server";
import { runJobForAllOrganizations, syncIndexValuesJob, auditUpdateJob } from "@/server/jobs";

export const maxDuration = 60;

/**
 * Busca automática de índices oficiais (INCC/IPCA/IGP-M) no Banco Central
 * (SGS) — agendada em vercel.json. Roda semanalmente (não mensal) porque
 * cada índice é publicado em uma data diferente do mês (IGP-M perto do fim
 * do próprio mês, IPCA e INCC só no mês seguinte); rodar toda semana garante
 * que a lacuna é preenchida pouco depois da publicação oficial, sem
 * depender de acertar o dia exato. Nunca sobrescreve um valor já lançado
 * (manual ou oficial) — só preenche meses sem nenhum valor. Rota é só o
 * "chamador" do job (docs/ESPEC_CONFIABILIDADE_JOBS_AUDITORIA.md, Parte 1);
 * cada execução por organização fica registrada em JobRun.
 *
 * Também dispara, na sequência, a auditoria de atualização por AMOSTRAGEM
 * (Parte 2) — a especificação pede rodar diariamente, mas o plano Hobby da
 * Vercel limita o número de cron jobs do projeto (só há 2 slots livres,
 * já ocupados por este cron e pelo de recálculo mensal), então fica
 * encadeada aqui: roda semanalmente em vez de diariamente. A verificação
 * completa (V3 em toda parcela, não amostra) fica encadeada no cron mensal
 * de recálculo. Ver docs/STATUS_IMPLANTACAO.md pra esse registro.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const results = await runJobForAllOrganizations(syncIndexValuesJob, "CRON");
  const auditResults = await runJobForAllOrganizations(auditUpdateJob, "CRON");

  return NextResponse.json({
    success: true,
    ranAt: new Date().toISOString(),
    results,
    auditResults,
  });
}
