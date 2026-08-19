import Link from "next/link";
import { requireAccessContext } from "@/server/auth-context";
import {
  getSalesSummary,
  getInventoryPosition,
  getReceivablesSummary,
  getPayablesSummary,
} from "@/server/reports";
import { listDevelopments } from "@/server/developments";
import { UNIT_STATUS_META } from "@/lib/unit-status";
import { formatCurrencyBRL } from "@/lib/format";

export default async function ReportsPage() {
  const context = await requireAccessContext();
  const [sales, inventory, receivables, payables, developments] = await Promise.all([
    getSalesSummary(context.organizationId),
    getInventoryPosition(context.organizationId),
    getReceivablesSummary(context.organizationId),
    getPayablesSummary(context.organizationId),
    listDevelopments(context.organizationId),
  ]);

  const cards = [
    { label: "VGV total", value: formatCurrency(sales.vgvTotal) },
    { label: "VGV vendido", value: formatCurrency(sales.vgvSold) },
    { label: "VGV disponível", value: formatCurrency(sales.vgvAvailable) },
    { label: "% vendido", value: `${sales.percentSold}%` },
    { label: "Ticket médio", value: formatCurrency(sales.averageTicket) },
    { label: "Carteira recebida", value: formatCurrency(receivables.totalReceived) },
    { label: "Carteira a receber", value: formatCurrency(receivables.totalOutstanding) },
    { label: "Inadimplência", value: `${formatCurrency(receivables.overdueAmount)} (${receivables.overdueCount})` },
    { label: "Contas pagas", value: formatCurrency(payables.totalPaid) },
    { label: "Contas a pagar", value: formatCurrency(payables.totalPending) },
  ];

  return (
    <>
      <h1>Relatórios executivos</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
          marginTop: "1.5rem",
          maxWidth: 1000,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            style={{
              border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>{card.label}</p>
            <p style={{ fontSize: "1.3rem", fontWeight: 600 }}>{card.value}</p>
          </div>
        ))}
      </div>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Posição de estoque</h2>
        <table style={{ marginTop: "0.5rem", maxWidth: 500 }}>
          <thead>
            <tr>
              <th>Status</th>
              <th>Unidades</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {inventory.rows.map((row) => (
              <tr key={row.status}>
                <td style={{ color: UNIT_STATUS_META[row.status as keyof typeof UNIT_STATUS_META]?.color }}>
                  {UNIT_STATUS_META[row.status as keyof typeof UNIT_STATUS_META]?.label ?? row.status}
                </td>
                <td>{row.count}</td>
                <td>{formatCurrency(row.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Outros relatórios</h2>
        <ul style={{ marginTop: "0.5rem" }}>
          <li>
            <Link href="/receivables/overdue">Inadimplência (detalhado)</Link>
          </li>
          <li>
            <Link href="/payables">Contas a pagar (detalhado)</Link>
          </li>
          <li>
            <Link href="/cash-flow">Fluxo de caixa</Link>
          </li>
        </ul>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Relatório do investidor por empreendimento</h2>
        <ul style={{ marginTop: "0.5rem" }}>
          {developments.map((development) => (
            <li key={development.id}>
              <Link href={`/reports/${development.id}`}>{development.name}</Link>
            </li>
          ))}
          {developments.length === 0 ? <li style={{ opacity: 0.7 }}>Nenhum empreendimento cadastrado.</li> : null}
        </ul>
      </section>
    </>
  );
}

const formatCurrency = formatCurrencyBRL;
