import { type NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAccessContext } from "@/server/auth-context";
import { getReportData, REPORT_GROUPS, type ReportKey, type ReportColumn, type ReportResult } from "@/server/reports-center";
import { renderGenericReportPdf, type GenericReportColumn } from "@/lib/document-pdf";
import { formatCurrencyBRL, formatCalendarDateBR, formatPercent, formatDateTimeBR } from "@/lib/format";

const ALL_KEYS = new Set<string>(REPORT_GROUPS.flatMap((g) => g.reports.map((r) => r.key)));

function formatCell(value: string | number | Date | null, type: ReportColumn["type"]): string {
  if (value === null || value === undefined) return "—";
  if (type === "currency") return formatCurrencyBRL(Number(value));
  if (type === "percent") return formatPercent(Number(value));
  if (type === "date") return value instanceof Date ? formatCalendarDateBR(value) : String(value);
  if (type === "number") return String(value);
  return String(value);
}

function buildFiltersLabel(params: URLSearchParams) {
  const parts: string[] = [];
  if (params.get("dateFrom")) parts.push(`De ${params.get("dateFrom")}`);
  if (params.get("dateTo")) parts.push(`até ${params.get("dateTo")}`);
  if (params.get("developmentId")) parts.push("Empreendimento filtrado");
  return parts.length > 0 ? `Filtros: ${parts.join(" ")}` : "Sem filtros aplicados";
}

/** Exportação da Central de Relatórios (docs/ESPEC_FASE_C_DASHBOARD_EMPREENDIMENTOS.md, Etapa 5) — xlsx e PDF, mesmos filtros da tela. */
export async function GET(request: NextRequest) {
  const context = await requireAccessContext();
  const params = request.nextUrl.searchParams;

  const key = params.get("key") ?? "";
  if (!ALL_KEYS.has(key)) return NextResponse.json({ error: "Relatório inválido." }, { status: 400 });
  const format = params.get("format") === "pdf" ? "pdf" : "xlsx";

  const developmentId = params.get("developmentId") || undefined;
  const dateFrom = params.get("dateFrom") ? new Date(params.get("dateFrom")!) : undefined;
  const dateTo = params.get("dateTo") ? new Date(params.get("dateTo")!) : undefined;

  let report: ReportResult;
  try {
    report = await getReportData(context, key as ReportKey, { developmentId, dateFrom, dateTo });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao gerar relatório." }, { status: 400 });
  }

  const fileNameBase = report.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(report.title.slice(0, 31));
    sheet.columns = report.columns.map((col) => ({ header: col.label, key: col.key, width: 22 }));
    sheet.getRow(1).font = { bold: true };
    for (const row of report.rows) {
      sheet.addRow(
        Object.fromEntries(
          report.columns.map((col) => [
            col.key,
            col.type === "date" && row[col.key] instanceof Date ? formatCalendarDateBR(row[col.key] as Date) : row[col.key],
          ]),
        ),
      );
    }
    for (const column of sheet.columns) {
      const meta = report.columns.find((c) => c.key === column.key);
      if (meta?.type === "currency") column.numFmt = "#,##0.00";
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileNameBase}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  }

  const pdfColumns: GenericReportColumn[] = report.columns.map((col) => ({
    label: col.label,
    align: col.type === "currency" || col.type === "number" || col.type === "percent" ? "right" : "left",
  }));
  const pdfRows = report.rows.map((row) => report.columns.map((col) => formatCell(row[col.key], col.type)));

  const pdfBuffer = await renderGenericReportPdf({
    title: report.title,
    filtersLabel: buildFiltersLabel(params),
    columns: pdfColumns,
    rows: pdfRows,
    footer: `${report.title} — gerado em ${formatDateTimeBR(new Date())}`,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileNameBase}-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  });
}
