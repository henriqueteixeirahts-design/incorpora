import { type NextRequest, NextResponse } from "next/server";
import { runJobForAllOrganizations, auditUpdateFullJob } from "@/server/jobs";

export const maxDuration = 60; // teto do plano Hobby da Vercel

/**
 * Auditoria de atualização completa (docs/
 * ESPEC_CONFIABILIDADE_JOBS_AUDITORIA.md, Parte 2.2). Mesmas 5 verificações
 * da amostragem, mas a V3 (consistência da memória) confere TODA parcela
 * em aberto, não uma amostra.
 *
 * NÃO está agendada em vercel.json (mesma limitação de cron slots do plano
 * Hobby explicada em /api/cron/audit-update) — fica encadeada depois do
 * recálculo mensal (/api/cron/recalculate-installments), que já roda uma
 * vez por mês e é o momento natural pra conferir tudo. Esta rota continua
 * existindo como entrada manual (CRON_SECRET) — inclusive é o que o botão
 * "Re-verificar agora" da tela de Auditoria chama por baixo (via
 * runJobManually, não por HTTP).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const results = await runJobForAllOrganizations(auditUpdateFullJob, "CRON");

  return NextResponse.json({ success: true, ranAt: new Date().toISOString(), results });
}
