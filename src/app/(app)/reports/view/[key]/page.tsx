import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext } from "@/server/auth-context";
import { getReportData, REPORT_GROUPS, type ReportKey } from "@/server/reports-center";
import { listDevelopments } from "@/server/developments";
import { formatCurrencyBRL, formatCalendarDateBR, formatPercent } from "@/lib/format";
import { ReportFiltersForm } from "../../report-filters";

const ALL_REPORTS: { key: ReportKey; label: string }[] = REPORT_GROUPS.flatMap((g) => [...g.reports]);

function formatCell(value: string | number | Date | null, type: "text" | "currency" | "date" | "percent" | "number") {
  if (value === null || value === undefined) return "—";
  if (type === "currency") return formatCurrencyBRL(Number(value));
  if (type === "percent") return formatPercent(Number(value));
  if (type === "date") return value instanceof Date ? formatCalendarDateBR(value) : String(value);
  return String(value);
}

export default async function ReportViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { key } = await params;
  const sp = await searchParams;
  const context = await requireAccessContext();

  const reportMeta = ALL_REPORTS.find((r) => r.key === key);
  if (!reportMeta) notFound();

  const developmentId = sp.developmentId || undefined;
  const dateFrom = sp.dateFrom ? new Date(sp.dateFrom) : undefined;
  const dateTo = sp.dateTo ? new Date(sp.dateTo) : undefined;

  const [report, developments] = await Promise.all([
    getReportData(context, key as ReportKey, { developmentId, dateFrom, dateTo }),
    listDevelopments(context),
  ]);

  const exportQs = new URLSearchParams({ key });
  if (developmentId) exportQs.set("developmentId", developmentId);
  if (sp.dateFrom) exportQs.set("dateFrom", sp.dateFrom);
  if (sp.dateTo) exportQs.set("dateTo", sp.dateTo);

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href="/reports">← Central de relatórios</Link>
      </p>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Relatórios</div>
          <h1 className="inc-h1">{report.title}</h1>
        </div>
        <div className="inc-page-head__actions" style={{ display: "flex", gap: "0.5rem" }}>
          <a className="inc-btn inc-btn--secondary" href={`/api/reports/export?${exportQs.toString()}&format=xlsx`}>
            Exportar xlsx
          </a>
          <a className="inc-btn inc-btn--secondary" href={`/api/reports/export?${exportQs.toString()}&format=pdf`}>
            Exportar PDF
          </a>
        </div>
      </div>

      <ReportFiltersForm
        reportKey={key}
        developments={developments.map((d) => ({ id: d.id, label: d.name }))}
        current={{ developmentId: sp.developmentId ?? "", dateFrom: sp.dateFrom ?? "", dateTo: sp.dateTo ?? "" }}
      />

      {report.rows.length === 0 ? (
        <p className="field-hint" style={{ marginTop: "1rem" }}>Nenhum registro encontrado com esses filtros.</p>
      ) : (
        <div style={{ overflowX: "auto", marginTop: "1rem" }}>
          <table className="inc-table">
            <thead>
              <tr>
                {report.columns.map((col) => (
                  <th key={col.key} className={col.type === "currency" || col.type === "number" || col.type === "percent" ? "is-num" : undefined}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row, i) => (
                <tr key={i}>
                  {report.columns.map((col) => (
                    <td key={col.key} className={col.type === "currency" || col.type === "number" || col.type === "percent" ? "is-num" : undefined}>
                      {formatCell(row[col.key], col.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
