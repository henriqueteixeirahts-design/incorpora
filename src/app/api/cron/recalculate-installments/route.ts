import { type NextRequest, NextResponse } from "next/server";
import { runJobForAllOrganizations, recalculateInstallmentsJob, auditUpdateFullJob } from "@/server/jobs";

export const maxDuration = 60; // teto do plano Hobby da Vercel — se ficar apertado com o volume real de dados, é o sinal pra migrar pro serviço de fila (Parte 1.3 da especificação)

/**
 * Correção mensal automática (PRD seção 12) — agendada em vercel.json
 * (dia 2 de cada mês). Rota é só o "chamador" do job (docs/
 * ESPEC_CONFIABILIDADE_JOBS_AUDITORIA.md, Parte 1) — a lógica de recálculo
 * vive em src/server/jobs.ts, e cada execução por organização fica
 * registrada em JobRun. Antes desta rota existir, o recálculo só
 * acontecia quando alguém abria uma tela específica.
 *
 * Também dispara, na sequência, a auditoria de atualização COMPLETA
 * (Parte 2 da mesma especificação) — verifica toda parcela em aberto, não
 * uma amostra, logo depois do recálculo do mês. Encadeada aqui (em vez de
 * um cron próprio) porque o plano Hobby da Vercel limita o número de cron
 * jobs do projeto; os dois já usados (este e o de índices) não sobram
 * slot pra mais dois. Ver docs/STATUS_IMPLANTACAO.md pra esse registro.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const results = await runJobForAllOrganizations(recalculateInstallmentsJob, "CRON");
  const auditResults = await runJobForAllOrganizations(auditUpdateFullJob, "CRON");

  return NextResponse.json({
    success: true,
    ranAt: new Date().toISOString(),
    results,
    auditResults,
  });
}
