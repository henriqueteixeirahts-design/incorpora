import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext } from "@/server/auth-context";
import { getInvestorReport } from "@/server/reports";

export default async function InvestorReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  let report;
  try {
    report = await getInvestorReport(context.organizationId, id);
  } catch {
    notFound();
  }

  const { development, sales, receivables, payables, cashFlow } = report;

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href="/reports">← Relatórios</Link>
      </p>
      <h1>Relatório do investidor — {development.name}</h1>
      <p style={{ opacity: 0.7 }}>
        {development.spe.name} ({development.spe.document})
      </p>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Resumo executivo</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "1rem",
            marginTop: "0.75rem",
            maxWidth: 900,
          }}
        >
          {[
            { label: "VGV total", value: formatCurrency(sales.vgvTotal) },
            { label: "VGV vendido", value: formatCurrency(sales.vgvSold) },
            { label: "VGV disponível", value: formatCurrency(sales.vgvAvailable) },
            { label: "% vendido", value: `${sales.percentSold}%` },
            { label: "Unidades vendidas", value: `${sales.unitsSold} / ${sales.unitsTotal}` },
            { label: "Ticket médio", value: formatCurrency(sales.averageTicket) },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
                borderRadius: 8,
                padding: "1rem",
              }}
            >
              <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>{card.label}</p>
              <p style={{ fontSize: "1.2rem", fontWeight: 600 }}>{card.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Carteira</h2>
        <p>Recebido: {formatCurrency(receivables.totalReceived)}</p>
        <p>A receber: {formatCurrency(receivables.totalOutstanding)}</p>
        <p>
          Inadimplência: {formatCurrency(receivables.overdueAmount)} ({receivables.overdueCount}{" "}
          parcela{receivables.overdueCount === 1 ? "" : "s"})
        </p>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Despesas</h2>
        <p>Pago: {formatCurrency(payables.totalPaid)}</p>
        <p>A pagar: {formatCurrency(payables.totalPending)}</p>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Fluxo de caixa (últimos e próximos meses)</h2>
        <table style={{ marginTop: "0.5rem", maxWidth: 800 }}>
          <thead>
            <tr>
              <th>Mês</th>
              <th>A receber</th>
              <th>A pagar</th>
              <th>Saldo previsto</th>
            </tr>
          </thead>
          <tbody>
            {cashFlow.map((month) => (
              <tr key={month.month}>
                <td>{formatMonth(month.month)}</td>
                <td>{formatCurrency(month.receivablesForecast)}</td>
                <td>{formatCurrency(month.payablesForecast)}</td>
                <td style={{ color: month.netForecast < 0 ? "#e03131" : undefined }}>
                  {formatCurrency(month.netForecast)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p style={{ marginTop: "2rem", fontSize: "0.8rem", opacity: 0.6 }}>
        Este relatório consolida os dados já cadastrados no sistema. A gestão de participações e
        aportes de investidores (Fase 13 do PRD) ainda não foi modelada — este é o resumo
        executivo do empreendimento, não um extrato individual por investidor.
      </p>
    </>
  );
}

function formatMonth(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
