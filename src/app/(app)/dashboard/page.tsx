import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getLatestAuditRun } from "@/server/audit";
import { getDashboardMirrorSummary, getRecentSales } from "@/server/dashboard";
import { getExecutiveDashboard } from "@/server/dashboard-executive";
import { listDevelopments } from "@/server/developments";
import { MirrorSummaryGrid } from "./mirror-summary";
import { CashFlowBars } from "./cash-flow-bars";
import { DashboardFilters } from "./dashboard-filters";
import { formatCurrencyBRL as formatCurrency, formatPercent, formatCalendarDateBR } from "@/lib/format";

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

function defaultPeriod() {
  const now = new Date();
  return {
    dateFrom: new Date(now.getFullYear(), now.getMonth(), 1),
    dateTo: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();
  const canViewAudit = hasPermission(context, "audit", "VIEW");
  const canViewComercial = hasPermission(context, "sale", "VIEW");
  const canViewCarteira = hasPermission(context, "installment", "VIEW");
  const canViewFinanceiro = hasPermission(context, "payable", "VIEW");

  const developmentId = params.developmentId || undefined;
  const { dateFrom: defaultFrom, dateTo: defaultTo } = defaultPeriod();
  const dateFrom = params.dateFrom ? new Date(params.dateFrom) : defaultFrom;
  const dateTo = params.dateTo ? new Date(params.dateTo) : defaultTo;

  const [latestAuditRun, mirrorSummary, recentSales, executive, developments] = await Promise.all([
    canViewAudit ? getLatestAuditRun(context.organizationId) : Promise.resolve(null),
    getDashboardMirrorSummary(context),
    getRecentSales(context, 6),
    getExecutiveDashboard(context, { developmentId, period: { dateFrom, dateTo } }),
    listDevelopments(context),
  ]);

  const vgvVendido = formatCompactBRL(executive.comercial.vgvSold);
  const aReceber = formatCompactBRL(executive.carteira.totalOutstanding);
  const inadimplencia = formatCompactBRL(executive.carteira.overdueTotal);

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

      <DashboardFilters
        developments={developments.map((d) => ({ id: d.id, label: d.name }))}
        current={{ developmentId, dateFrom: params.dateFrom ?? defaultFrom.toISOString().slice(0, 10), dateTo: params.dateTo ?? defaultTo.toISOString().slice(0, 10) }}
      />

      <div className="inc-grid-4">
        <div className="inc-kpi">
          <div className="inc-kpi__label">VGV vendido</div>
          <div className="inc-kpi__value">
            R$ {vgvVendido.main} {vgvVendido.unit ? <small>{vgvVendido.unit}</small> : null}
          </div>
          <div className="inc-kpi__delta">
            {executive.comercial.percentSold}% do estoque
            {executive.comercial.vgvPermutante > 0
              ? ` · +${formatCompactBRL(executive.comercial.vgvPermutante).main}${formatCompactBRL(executive.comercial.vgvPermutante).unit ? ` ${formatCompactBRL(executive.comercial.vgvPermutante).unit}` : ""} em permuta (não é receita da SPE)`
              : ""}
          </div>
        </div>
        <div className="inc-kpi inc-kpi--gold">
          <div className="inc-kpi__label">A receber</div>
          <div className="inc-kpi__value">
            R$ {aReceber.main} {aReceber.unit ? <small>{aReceber.unit}</small> : null}
          </div>
          <div className="inc-kpi__delta">Saldo em aberto da carteira</div>
        </div>
        <div className="inc-kpi inc-kpi--sky">
          <div className="inc-kpi__label">VSO do período</div>
          <div className="inc-kpi__value">{formatPercent(executive.comercial.vso)}</div>
          <div className="inc-kpi__delta">{executive.comercial.salesInPeriodCount} venda(s) no período</div>
        </div>
        <div className="inc-kpi inc-kpi--brown">
          <div className="inc-kpi__label">Inadimplência</div>
          <div className="inc-kpi__value">
            R$ {inadimplencia.main} {inadimplencia.unit ? <small>{inadimplencia.unit}</small> : null}
          </div>
          <div className="inc-kpi__delta">{formatPercent(executive.carteira.inadimplenciaPct)} da carteira</div>
        </div>
      </div>

      {canViewComercial ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 className="inc-h2">Comercial</h2>
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

            <div className="inc-card">
              <div className="inc-card__head">
                <div className="inc-card__title">Funil comercial</div>
              </div>
              <div className="inc-card__body" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div>Reservas ativas: <strong>{executive.comercial.funil.reservasAtivas}</strong></div>
                <div>Propostas em análise: <strong>{executive.comercial.funil.propostasEmAnalise}</strong></div>
                <div>Vendas no período: <strong>{executive.comercial.funil.vendasNoPeriodo}</strong></div>
                <div style={{ marginTop: "0.5rem", borderTop: "1px solid var(--inc-border)", paddingTop: "0.5rem" }}>
                  Distratos no período: <strong>{executive.comercial.distratos.count}</strong> ({formatCurrency(executive.comercial.distratos.totalValue)})
                  <div className="inc-card__meta">Índice distrato/venda: {formatPercent(executive.comercial.distratos.indiceDistratoVenda)}</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--inc-gap-grid)", marginTop: "1rem" }}>
            <div className="inc-card">
              <div className="inc-card__head"><div className="inc-card__title">Curva de vendas (12 meses)</div></div>
              <table className="inc-table" style={{ border: 0 }}>
                <thead><tr><th>Mês</th><th className="is-num">Unidades</th><th className="is-num">VGV</th></tr></thead>
                <tbody>
                  {executive.comercial.salesCurve.map((m) => (
                    <tr key={m.month}>
                      <td>{m.month}</td>
                      <td className="is-num">{m.unitsSold}</td>
                      <td className="is-num">{formatCurrency(m.vgvSold)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="inc-card">
              <div className="inc-card__head"><div className="inc-card__title">Ranking de canais (período)</div></div>
              <table className="inc-table" style={{ border: 0 }}>
                <thead><tr><th>Corretor/Imobiliária</th><th className="is-num">Vendas</th><th className="is-num">Pago</th></tr></thead>
                <tbody>
                  {executive.comercial.rankingCanais.length === 0 ? (
                    <tr><td colSpan={3} className="is-empty">Sem comissões externas no período.</td></tr>
                  ) : null}
                  {executive.comercial.rankingCanais.map((row) => (
                    <tr key={row.key}>
                      <td>{row.name}</td>
                      <td className="is-num">{row.saleCount}</td>
                      <td className="is-num">{formatCurrency(row.totalPaid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="inc-card" style={{ marginTop: "1rem" }}>
            <div className="inc-card__head"><div className="inc-card__title">Últimas vendas</div></div>
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
                  <tr><td colSpan={4} className="is-empty">Nenhuma venda registrada ainda.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {canViewCarteira ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 className="inc-h2">Carteira</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--inc-gap-grid)" }}>
            <div className="inc-card">
              <div className="inc-card__head"><div className="inc-card__title">Recebido × previsto (período)</div></div>
              <div className="inc-card__body" style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <div>Recebido: <strong>{formatCurrency(executive.carteira.recebidoNoPeriodo)}</strong></div>
                <div>Previsto (vencimento no período): <strong>{formatCurrency(executive.carteira.previstoNoPeriodo)}</strong></div>
                <div style={{ marginTop: "0.5rem", borderTop: "1px solid var(--inc-border)", paddingTop: "0.5rem" }}>
                  Renegociações no período: <strong>{executive.carteira.renegociacoes.volume}</strong>
                  <div className="inc-card__meta">Taxa de cumprimento: {formatPercent(executive.carteira.renegociacoes.taxaCumprimento)}</div>
                </div>
              </div>
            </div>
            <div className="inc-card">
              <div className="inc-card__head"><div className="inc-card__title">Aging resumido</div></div>
              <table className="inc-table" style={{ border: 0 }}>
                <thead><tr><th>Faixa</th><th className="is-num">Valor</th><th className="is-num">Títulos</th></tr></thead>
                <tbody>
                  {executive.carteira.agingResumo.map((b) => (
                    <tr key={b.bucket}>
                      <td>{b.label}</td>
                      <td className="is-num">{formatCurrency(b.totalValue)}</td>
                      <td className="is-num">{b.installmentCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <a href="/receivables/overdue" style={{ fontSize: "0.85rem" }}>Ver painel completo de inadimplência →</a>
            </div>
          </div>
        </section>
      ) : null}

      {canViewFinanceiro ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 className="inc-h2">Financeiro</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "var(--inc-gap-grid)" }}>
            <div className="inc-card">
              <div className="inc-card__body">
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div className="inc-card__title">Fluxo de caixa projetado</div>
                  <div style={{ marginLeft: "auto", fontSize: "12px", color: "var(--inc-text-soft)" }}>
                    {executive.financeiro.cashFlowBuckets.length} meses
                  </div>
                </div>
                <CashFlowBars buckets={executive.financeiro.cashFlowBuckets} />
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
              <div className="inc-card__head"><div className="inc-card__title">Contas a pagar</div></div>
              <div className="inc-card__body" style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <div>Próximos 7 dias: <strong>{formatCurrency(executive.financeiro.contasAPagarSemana)}</strong></div>
                <div>Próximos 30 dias: <strong>{formatCurrency(executive.financeiro.contasAPagarMes)}</strong></div>
                <a href="/payables" style={{ fontSize: "0.85rem" }}>Ver contas a pagar →</a>
              </div>
            </div>
          </div>

          <div className="inc-card" style={{ marginTop: "1rem" }}>
            <div className="inc-card__head"><div className="inc-card__title">Resultado e exposição de caixa por empreendimento</div></div>
            <table className="inc-table" style={{ border: 0 }}>
              <thead>
                <tr>
                  <th>Empreendimento</th>
                  <th className="is-num">Recebido (período)</th>
                  <th className="is-num">Pago (período)</th>
                  <th className="is-num">Resultado</th>
                  <th className="is-num">Exposição de caixa (6 meses)</th>
                </tr>
              </thead>
              <tbody>
                {executive.financeiro.resultadoPorEmpreendimento.map((row) => (
                  <tr key={row.developmentId}>
                    <td>{row.name}</td>
                    <td className="is-num">{formatCurrency(row.receita)}</td>
                    <td className="is-num">{formatCurrency(row.despesa)}</td>
                    <td className="is-num">{formatCurrency(row.resultado)}</td>
                    <td className="is-num" style={{ color: row.exposicao < 0 ? "var(--inc-danger)" : undefined }}>
                      {formatCurrency(row.exposicao)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section style={{ marginTop: "1.5rem" }}>
        <h2 className="inc-h2">Obra</h2>
        <table className="inc-table">
          <thead>
            <tr>
              <th>Empreendimento</th>
              <th className="is-num">% obra</th>
              <th className="is-num">% vendido</th>
              <th>Última medição</th>
              <th>Habite-se previsto</th>
              <th>Entrega prevista</th>
            </tr>
          </thead>
          <tbody>
            {executive.obra.developments.map((row) => (
              <tr key={row.developmentId}>
                <td>{row.name}</td>
                <td className="is-num">{row.percentObra !== null ? formatPercent(row.percentObra) : "—"}</td>
                <td className="is-num">{formatPercent(row.percentVendido)}</td>
                <td>{row.measurementDate ? formatCalendarDateBR(row.measurementDate) : "—"}</td>
                <td>{row.habiteSeDate ? formatCalendarDateBR(row.habiteSeDate) : "—"}</td>
                <td>{row.expectedDeliveryDate ? formatCalendarDateBR(row.expectedDeliveryDate) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
