import { type NextRequest, NextResponse } from "next/server";
import { syncAllIndexRules } from "@/server/index-rules";

export const maxDuration = 60;

/**
 * Busca automática de índices oficiais (INCC/IPCA/IGP-M) no Banco Central
 * (SGS) — agendada em vercel.json. Roda semanalmente (não mensal) porque
 * cada índice é publicado em uma data diferente do mês (IGP-M perto do fim
 * do próprio mês, IPCA e INCC só no mês seguinte); rodar toda semana garante
 * que a lacuna é preenchida pouco depois da publicação oficial, sem
 * depender de acertar o dia exato. Nunca sobrescreve um valor já lançado
 * (manual ou oficial) — só preenche meses sem nenhum valor.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const results = await syncAllIndexRules();

  return NextResponse.json({ success: true, ranAt: new Date().toISOString(), results });
}
