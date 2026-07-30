import { type NextRequest, NextResponse } from "next/server";
import { runJobForAllOrganizations, expireReservationsJob } from "@/server/jobs";

export const maxDuration = 60;

/**
 * Expiração de reservas + promoção da fila de espera (docs/
 * ESPEC_MODULO_COMERCIAL.md, Parte 2). NÃO está agendada em vercel.json —
 * mesma limitação de cron slots do plano Hobby já documentada nos outros
 * crons standalone (ver /api/cron/audit-update). O disparo real hoje é por
 * evento (`runJobForSingleOrganization(expireReservationsJob, ..., "EVENT")`
 * ao carregar o espelho/Comercial) — esta rota fica pronta pra virar cron
 * de verdade (ou disparo de fila) quando o plano/infra mudar, sem precisar
 * reescrever a lógica.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const results = await runJobForAllOrganizations(expireReservationsJob, "CRON");

  return NextResponse.json({ success: true, ranAt: new Date().toISOString(), results });
}
