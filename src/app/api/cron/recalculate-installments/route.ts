import { type NextRequest, NextResponse } from "next/server";
import { runJobForAllOrganizations, recalculateInstallmentsJob } from "@/server/jobs";

export const maxDuration = 60;

/**
 * Correção mensal automática (PRD seção 12) — agendada em vercel.json
 * (dia 2 de cada mês). Rota é só o "chamador" do job (docs/
 * ESPEC_CONFIABILIDADE_JOBS_AUDITORIA.md, Parte 1) — a lógica de recálculo
 * vive em src/server/jobs.ts, e cada execução por organização fica
 * registrada em JobRun. Antes desta rota existir, o recálculo só
 * acontecia quando alguém abria uma tela específica.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const results = await runJobForAllOrganizations(recalculateInstallmentsJob, "CRON");

  return NextResponse.json({ success: true, ranAt: new Date().toISOString(), results });
}
