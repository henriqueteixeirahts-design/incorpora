import { type NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAccessContext } from "@/server/auth-context";
import { getCashFlow, type CashFlowGranularity } from "@/server/cash-flow";

const GRANULARITY_LABELS: Record<CashFlowGranularity, string> = {
  monthly: "Mensal",
  weekly: "Semanal",
  daily: "Diária",
};

/** Exportação xlsx do fluxo de caixa detalhado (Fase B, Parte 4.4) — mesmos filtros da tela. */
export async function GET(request: NextRequest) {
  const context = await requireAccessContext();
  const params = request.nextUrl.searchParams;

  const granularity = (params.get("granularity") as CashFlowGranularity) || "monthly";
  const developmentId = params.get("developmentId") || undefined;
  const speId = params.get("speId") || undefined;

  const buckets = await getCashFlow(context, { developmentId, speId, granularity });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Fluxo de caixa (${GRANULARITY_LABELS[granularity]})`);

  sheet.columns = [
    { header: "Período", key: "period", width: 14 },
    { header: "A receber (previsto)", key: "receivablesForecast", width: 20 },
    { header: "Recebido (realizado)", key: "receivablesRealized", width: 20 },
    { header: "A pagar (previsto)", key: "payablesForecast", width: 20 },
    { header: "Pago (realizado)", key: "payablesRealized", width: 20 },
    { header: "Saldo previsto (mês)", key: "netForecast", width: 20 },
    { header: "Saldo realizado (mês)", key: "netRealized", width: 20 },
    { header: "Diferença (realizado - previsto)", key: "variance", width: 24 },
    { header: "Saldo acumulado previsto", key: "cumulativeForecast", width: 24 },
    { header: "Saldo acumulado realizado", key: "cumulativeRealized", width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const bucket of buckets) {
    sheet.addRow(bucket);
  }

  for (const column of sheet.columns) {
    if (column.key === "period") continue;
    column.numFmt = '#,##0.00';
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fluxo-de-caixa-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
