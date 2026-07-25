import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recalculateAllOpenInstallments } from "@/server/receivables";

export const maxDuration = 60;

/**
 * Correção mensal automática (PRD seção 12) — agendada em vercel.json
 * (dia 2 de cada mês). Recalcula toda parcela em aberto de toda
 * organização, gerando um novo FinancialCalculation por parcela (nunca
 * sobrescreve). Antes desta rota, o recálculo só acontecia quando alguém
 * abria uma tela específica.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });

  const results = [];
  for (const organization of organizations) {
    const result = await recalculateAllOpenInstallments(organization.id);
    results.push({ organizationId: organization.id, name: organization.name, ...result });
  }

  return NextResponse.json({ success: true, ranAt: new Date().toISOString(), results });
}
