import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getLatestAuditRun } from "@/server/audit";
import { getSalesSummary, getReceivablesSummary, getInventoryPosition } from "@/server/reports";
import { getCashFlow } from "@/server/cash-flow";
import { getDashboardMirrorSummary, getRecentSales } from "@/server/dashboard";
import { MirrorSummaryGrid } from "./mirror-summary";
import { CashFlowBars } from "./cash-flow-bars";

const currencyFull = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateShort = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

function formatCompactBRL(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return { main: (value / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }), unit: "mi" };
  }
  if (abs >= 1_000) {
    return { main: (value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }), unit: "mil" };
  }
  return { main: value.toLocaleString("pt-BR", { maximumFractionDigits: 0 }), unit: "" };
}

export default async function DashboardPage() {
  const context = await requireAccessContext();
  const canViewAudit = hasPermission(context, "audit", "VIEW");

  const [salesSummary, receivablesSummary, inventory, latestAuditRun, mirrorSummary, cashFlowBuckets, recentSales] =
    await Promise.all([
      getSalesSummary(context.organizationId),
      getReceivablesSummary(context.organizationId),
      getInventoryPosition(context.organizationId),
      canViewAudit ? getLatestAuditRun(context.organizationId) : Promise.resolve(null),
      getDashboardMirrorSummary(context.organizationId),
      getCashFlow(context.organizationId, { monthsBack: 0, monthsForward: 5 }),
      getRecentSales(context.organizationId, 6),
    ]);

  const availableUnits = inventory.rows.find((row) => row.status === "AVAILABLE")?.count ?? 0;
  const percentStock = inventory.totalUnits > 0 ? (availableUnits / inventory.totalUnits) * 100 : 0;

  const vgvVendido = formatCompactBRL(salesSummary.vgvSold);
  const aReceber = formatCompactBRL(receivablesSummary.totalOutstanding);
  const inadimplencia = formatCompactBRL(receivablesSummary.overdueAmount);

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">{context.roleNames.join(", ") || "Sem papel atribuído"}</div>
          <h1 className="inc-h1">Dashboard</h1>
        </div>
        {canViewAudit ? (
          <div className="inc-page-head__actions">
            <span className={`inc-pill ${!latestAuditRun ? "" : latestAuditRun.status === "OK" ? "inc-pill--ok" : "inc-pill--warn"}`}>
              <span className="inc-pill__dot" />
              {!latestAuditRun
                ? "Auditoria ainda não rodou"
                : latestAuditRun.status === "OK"
                  ? "Carteira íntegra"
                  : "Auditoria encontrou problema"}
            </span>
          </div>
        ) : null}
      </div>

      <div className="inc-grid-4">
        <div className="inc-kpi">
          <div className="inc-kpi__label">VGV vendido</div>
          <div className="inc-kpi__value">
            R$ {vgvVendido.main} {vgvVendido.unit ? <small>{vgvVendido.unit}</small> : null}
          </div>
          <div className="inc-kpi__delta">{salesSummary.unitsSold} unidade(s) vendida(s)</div>
        </div>
        <div className="inc-kpi inc-kpi--gold">
          <div className="inc-kpi__label">A receber</div>
          <div className="inc-kpi__value">
            R$ {aReceber.main} {aReceber.unit ? <small>{aReceber.unit}</small> : null}
          </div>
          <div className="inc-kpi__delta">Saldo em aberto da carteira</div>
        </div>
        <div className="inc-kpi inc-kpi--sky">
          <div className="inc-kpi__label">Unidades em estoque</div>
          <div className="inc-kpi__value">
            {availableUnits} <small>/ {inventory.totalUnits}</small>
          </div>
          <div className="inc-kpi__delta">{percentStock.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total</div>
        </div>
        <div className="inc-kpi inc-kpi--brown">
          <div className="inc-kpi__label">Inadimplência</div>
          <div className="inc-kpi__value">
            R$ {inadimplencia.main} {inadimplencia.unit ? <small>{inadimplencia.unit}</small> : null}
          </div>
          <div className="inc-kpi__delta">{receivablesSummary.overdueCount} contrato(s) em atraso</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "var(--inc-gap-grid)" }}>
        <div className="inc-card">
          <div className="inc-card__head">
            <div>
              <div className="inc-card__title">Espelho de vendas</div>
              {mirrorSummary ? <div className="inc-card__meta">{mirrorSummary.developmentName}</div> : null}
            </div>
          </div>
          <div className="inc-card__body">
            {mirrorSummary ? (
              <MirrorSummaryGrid summary={mirrorSummary} />
            ) : (
              <p style={{ color: "var(--inc-text-soft)", fontSize: "var(--inc-fs-sm)" }}>
                Nenhum empreendimento com torres e pavimentos cadastrados ainda.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--inc-gap-grid)" }}>
          <div className="inc-card">
            <div className="inc-card__body">
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div className="inc-card__title">Fluxo de caixa projetado</div>
                <div style={{ marginLeft: "auto", fontSize: "12px", color: "var(--inc-text-soft)" }}>
                  {cashFlowBuckets.length} meses
                </div>
              </div>
              <CashFlowBars buckets={cashFlowBuckets} />
              <div style={{ marginTop: "12px", display: "flex", gap: "16px" }}>
                <div className="inc-legend__item">
                  <span className="inc-legend__swatch" style={{ background: "var(--inc-brand-azul-claro)" }} />
                  Entradas
                </div>
                <div className="inc-legend__item">
                  <span className="inc-legend__swatch" style={{ background: "var(--inc-brand-dourado)" }} />
                  Saídas
                </div>
              </div>
            </div>
          </div>

          <div className="inc-card">
            <div className="inc-card__head">
              <div className="inc-card__title">Últimas vendas</div>
            </div>
            <table className="inc-table" style={{ border: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 88 }}>Unidade</th>
                  <th>Cliente</th>
                  <th className="is-num" style={{ width: 120 }}>Valor</th>
                  <th className="is-num" style={{ width: 90 }}>Data</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="is-key">{sale.unitNumber}</td>
                    <td>
                      {sale.customerName}
                      <div className="inc-table__sub">{sale.developmentName}</div>
                    </td>
                    <td className="is-num is-strong">{currencyFull.format(sale.salePrice)}</td>
                    <td className="is-num is-muted">{dateShort.format(sale.saleDate)}</td>
                  </tr>
                ))}
                {recentSales.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="is-empty">
                      Nenhuma venda registrada ainda.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
