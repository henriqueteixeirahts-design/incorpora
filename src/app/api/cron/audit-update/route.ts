import { type NextRequest, NextResponse } from "next/server";
import { runJobForAllOrganizations, auditUpdateJob } from "@/server/jobs";

export const maxDuration = 60;

/**
 * Auditoria de atualização por amostragem (docs/
 * ESPEC_CONFIABILIDADE_JOBS_AUDITORIA.md, Parte 2) — roda as 5 verificações
 * (V1-V5) e alimenta o selo de saúde do dashboard.
 *
 * NÃO está agendada em vercel.json: o plano Hobby da Vercel limita o
 * número de cron jobs do projeto, e os 2 slots já são usados pelo
 * recálculo mensal e pela busca de índices — a auditoria por amostragem
 * fica encadeada depois da busca de índices (semanalmente, em
 * /api/cron/sync-index-values) em vez de ter cron próprio. Esta rota
 * continua existindo como entrada manual (mesma autenticação por
 * CRON_SECRET) — útil se o plano for atualizado, ou pra disparo avulso.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const results = await runJobForAllOrganizations(auditUpdateJob, "CRON");

  return NextResponse.json({ success: true, ranAt: new Date().toISOString(), results });
}
