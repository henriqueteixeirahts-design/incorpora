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

const formatCurrency = formatCurrencyBRL;

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
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Relatórios</div>
          <h1 className="inc-h1">Relatórios executivos</h1>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--inc-gap-kpi)" }}>
        {cards.map((card) => (
          <div key={card.label} className="inc-kpi">
            <div className="inc-kpi__label">{card.label}</div>
            <div className="inc-kpi__value" style={{ fontSize: "20px" }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="inc-card">
        <div className="inc-card__head">
          <div className="inc-card__title">Posição de estoque</div>
        </div>
        <table className="inc-table" style={{ border: 0 }}>
          <thead>
            <tr>
              <th>Status</th>
              <th className="is-num">Unidades</th>
              <th className="is-num">Valor</th>
            </tr>
          </thead>
          <tbody>
            {inventory.rows.map((row) => {
              const meta = UNIT_STATUS_META[row.status as keyof typeof UNIT_STATUS_META];
              return (
                <tr key={row.status}>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta?.color, flex: "none" }} />
                      {meta?.label ?? row.status}
                    </span>
                  </td>
                  <td className="is-num">{row.count}</td>
                  <td className="is-num is-strong">{formatCurrency(row.value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="inc-card">
        <div className="inc-card__head">
          <div className="inc-card__title">Outros relatórios</div>
        </div>
        <div className="inc-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--inc-space-4)" }}>
          <Link href="/receivables/overdue">Inadimplência (detalhado)</Link>
          <Link href="/payables">Contas a pagar (detalhado)</Link>
          <Link href="/cash-flow">Fluxo de caixa</Link>
        </div>
      </div>

      <div className="inc-card">
        <div className="inc-card__head">
          <div className="inc-card__title">Relatório do investidor por empreendimento</div>
        </div>
        <div className="inc-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--inc-space-4)" }}>
          {developments.map((development) => (
            <Link key={development.id} href={`/reports/${development.id}`}>
              {development.name}
            </Link>
          ))}
          {developments.length === 0 ? (
            <p className="inc-help">Nenhum empreendimento cadastrado.</p>
          ) : null}
        </div>
      </div>
    </>
  );
}
