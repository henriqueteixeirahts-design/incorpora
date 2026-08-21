import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext } from "@/server/auth-context";
import { getInvestorReport } from "@/server/reports";
import { formatCurrencyBRL, formatCalendarDateBR } from "@/lib/format";

const formatCurrency = formatCurrencyBRL;

export default async function InvestorReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  let report;
  try {
    report = await getInvestorReport(context, id);
  } catch {
    notFound();
  }

  const { development, sales, receivables, payables, cashFlow } = report;

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">
            <Link href="/reports">← Relatórios</Link>
          </div>
          <h1 className="inc-h1">Relatório do investidor — {development.name}</h1>
          <p className="inc-lede">
            {development.spe.name} ({development.spe.document})
          </p>
        </div>
      </div>

      <div className="inc-card">
        <div className="inc-card__head">
          <div className="inc-card__title">Resumo executivo</div>
        </div>
        <div className="inc-card__body">
          <div className="inc-grid-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            {[
              { label: "VGV total", value: formatCurrency(sales.vgvTotal) },
              { label: "VGV vendido", value: formatCurrency(sales.vgvSold) },
              { label: "VGV disponível", value: formatCurrency(sales.vgvAvailable) },
              { label: "% vendido", value: `${sales.percentSold}%` },
              { label: "Unidades vendidas", value: `${sales.unitsSold} / ${sales.unitsTotal}` },
              { label: "Ticket médio", value: formatCurrency(sales.averageTicket) },
            ].map((card) => (
              <div key={card.label} className="inc-kpi">
                <div className="inc-kpi__label">{card.label}</div>
                <div className="inc-kpi__value" style={{ fontSize: "20px" }}>{card.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--inc-gap-grid)" }}>
        <div className="inc-card">
          <div className="inc-card__head">
            <div className="inc-card__title">Carteira</div>
          </div>
          <div className="inc-card__body inc-dl" style={{ gridTemplateColumns: "1fr" }}>
            <div>
              <dt className="inc-help">Recebido</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>{formatCurrency(receivables.totalReceived)}</dd>
            </div>
            <div>
              <dt className="inc-help">A receber</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>{formatCurrency(receivables.totalOutstanding)}</dd>
            </div>
            <div>
              <dt className="inc-help">Inadimplência</dt>
              <dd style={{ margin: 0, fontWeight: 600, color: receivables.overdueAmount > 0 ? "var(--inc-danger)" : undefined }}>
                {formatCurrency(receivables.overdueAmount)} ({receivables.overdueCount} parcela
                {receivables.overdueCount === 1 ? "" : "s"})
              </dd>
            </div>
          </div>
        </div>

        <div className="inc-card">
          <div className="inc-card__head">
            <div className="inc-card__title">Despesas</div>
          </div>
          <div className="inc-card__body inc-dl" style={{ gridTemplateColumns: "1fr" }}>
            <div>
              <dt className="inc-help">Pago</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>{formatCurrency(payables.totalPaid)}</dd>
            </div>
            <div>
              <dt className="inc-help">A pagar</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>{formatCurrency(payables.totalPending)}</dd>
            </div>
          </div>
        </div>
      </div>

      <div className="inc-card">
        <div className="inc-card__head">
          <div className="inc-card__title">Fluxo de caixa (últimos e próximos meses)</div>
        </div>
        <table className="inc-table" style={{ border: 0 }}>
          <thead>
            <tr>
              <th>Mês</th>
              <th className="is-num">A receber</th>
              <th className="is-num">A pagar</th>
              <th className="is-num">Saldo previsto</th>
            </tr>
          </thead>
          <tbody>
            {cashFlow.map((month) => (
              <tr key={month.period}>
                <td className="is-key">{formatMonth(month.period)}</td>
                <td className="is-num is-muted">{formatCurrency(month.receivablesForecast)}</td>
                <td className="is-num is-muted">{formatCurrency(month.payablesForecast)}</td>
                <td className="is-num is-strong" style={{ color: month.netForecast < 0 ? "var(--inc-danger)" : undefined }}>
                  {formatCurrency(month.netForecast)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="inc-help" style={{ maxWidth: 700 }}>
        Este relatório consolida os dados já cadastrados no sistema. A gestão de participações e
        aportes de investidores (Fase 13 do PRD) ainda não foi modelada — este é o resumo
        executivo do empreendimento, não um extrato individual por investidor.
      </p>
    </>
  );
}

function formatMonth(key: string) {
  return formatCalendarDateBR(key, { month: "short", year: "numeric" });
}
