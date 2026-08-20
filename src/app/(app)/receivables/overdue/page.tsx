import Link from "next/link";
import { requireAccessContext } from "@/server/auth-context";
import { getPortfolioAging, getOverdueCustomerStages, AGING_BUCKET_ORDER, type AgingBucketKey } from "@/server/aging";
import { listDevelopments } from "@/server/developments";
import { listSpes } from "@/server/spes";
import { IndexFreshnessBanner } from "@/components/IndexFreshnessBanner";
import { AgingFiltersForm } from "./aging-filters-form";
import { formatCurrencyBRL, formatCalendarDateBR } from "@/lib/format";

const formatCurrency = formatCurrencyBRL;

function stepLabel(step: { offsetDays: number; actionLabel: string } | null) {
  if (!step) return "—";
  const dayLabel = step.offsetDays < 0 ? `D${step.offsetDays}` : `D+${step.offsetDays}`;
  return `${dayLabel} — ${step.actionLabel}`;
}

export default async function OverdueInstallmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const developmentId = params.development || undefined;
  const speId = params.spe || undefined;
  const minValue = params.min ? Number(params.min) : undefined;
  const maxValue = params.max ? Number(params.max) : undefined;
  const selectedBucket = (params.bucket as AgingBucketKey | undefined) && AGING_BUCKET_ORDER.includes(params.bucket as AgingBucketKey)
    ? (params.bucket as AgingBucketKey)
    : undefined;

  const [aging, stages, developments, spes] = await Promise.all([
    getPortfolioAging(context.organizationId, { developmentId, speId, minValue, maxValue }),
    getOverdueCustomerStages(context.organizationId),
    listDevelopments(context.organizationId),
    listSpes(context.organizationId),
  ]);

  const visibleRows = selectedBucket ? aging.rows.filter((r) => r.bucket === selectedBucket) : aging.rows;

  function bucketLink(bucket: AgingBucketKey | null) {
    const qs = new URLSearchParams();
    if (developmentId) qs.set("development", developmentId);
    if (speId) qs.set("spe", speId);
    if (minValue !== undefined) qs.set("min", String(minValue));
    if (maxValue !== undefined) qs.set("max", String(maxValue));
    if (bucket) qs.set("bucket", bucket);
    const query = qs.toString();
    return `/receivables/overdue${query ? `?${query}` : ""}`;
  }

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Financeiro</div>
          <h1 className="inc-h1">Inadimplência</h1>
          <p className="inc-lede">
            Aging da carteira por faixa de atraso e régua de cobrança assistida (docs/ESPEC_FASE_B_CARTEIRA_FINANCEIRO_1.md,
            Parte 3). Valores calculados ao vivo (índice + multa + juros de mora).
          </p>
        </div>
      </div>

      <IndexFreshnessBanner organizationId={context.organizationId} />

      <AgingFiltersForm
        developments={developments.map((d) => ({ id: d.id, label: d.name }))}
        spes={spes.map((s) => ({ id: s.id, label: s.name }))}
        current={{ developmentId, speId, minValue, maxValue }}
      />

      <div className="inc-grid-7" style={{ marginTop: "16px" }}>
        <Link href={bucketLink(null)} className="inc-band" aria-pressed={!selectedBucket} style={{ textDecoration: "none" }}>
          <div className="inc-band__label">Todos</div>
          <div className="inc-band__value">{formatCurrency(aging.summaries.reduce((s, b) => s + b.totalValue, 0))}</div>
          <div className="inc-band__sub">{aging.summaries.reduce((s, b) => s + b.installmentCount, 0)} parcela(s)</div>
        </Link>
        {aging.summaries.map((bucket) => (
          <Link
            key={bucket.bucket}
            href={bucketLink(bucket.bucket)}
            className="inc-band"
            aria-pressed={selectedBucket === bucket.bucket}
            style={{ textDecoration: "none" }}
          >
            <div className="inc-band__label">{bucket.label}</div>
            <div className="inc-band__value">{formatCurrency(bucket.totalValue)}</div>
            <div className="inc-band__sub">
              {bucket.installmentCount} parcela(s) · {bucket.customerCount} cliente(s)
            </div>
          </Link>
        ))}
      </div>

      <div className="inc-card" style={{ marginTop: "20px" }}>
        <table className="inc-table" style={{ border: 0 }}>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Empreendimento / Unidade</th>
              <th>Parcela</th>
              <th>Vencimento</th>
              <th>Dias em atraso</th>
              <th>Valor corrigido</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.installmentId}>
                <td className="is-key">
                  <Link href={`/customers/${row.customerId}/statement`} style={{ color: "inherit", textDecoration: "none" }}>
                    {row.customerName}
                  </Link>
                </td>
                <td className="is-muted">
                  {row.developmentName} — {row.unitNumber}
                </td>
                <td>{row.label}</td>
                <td className="is-muted">{formatCalendarDateBR(row.dueDate)}</td>
                <td>
                  <span className="inc-chip inc-chip--atraso">{row.daysOverdue} dia(s)</span>
                </td>
                <td className="is-strong">{formatCurrency(row.resultValue)}</td>
                <td>
                  <Link href={`/sales/${row.saleId}`} style={{ color: "var(--inc-brand-azul)", fontWeight: 500 }}>
                    Ver carteira →
                  </Link>
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="is-empty">
                  Nenhuma parcela nessa faixa.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <section style={{ marginTop: "32px" }}>
        <div className="inc-eyebrow">Régua de cobrança</div>
        <h2 className="inc-h1" style={{ fontSize: "19px", marginTop: "4px" }}>
          Clientes em atraso
        </h2>
        <p className="inc-lede" style={{ marginTop: "4px" }}>
          Etapa assistida: a régua não dispara sozinha ainda — o painel mostra em que etapa cada cliente está e a
          próxima ação sugerida; o registro do contato feito fica no extrato do cliente.
        </p>
        <div className="inc-card" style={{ marginTop: "12px" }}>
          <table className="inc-table" style={{ border: 0 }}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Dias em atraso (pior parcela)</th>
                <th>Etapa atual</th>
                <th>Próxima ação sugerida</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {stages.map((stage) => (
                <tr key={stage.customerId}>
                  <td className="is-key">{stage.customerName}</td>
                  <td>
                    <span className="inc-chip inc-chip--atraso">{stage.worstDaysOverdue} dia(s)</span>
                  </td>
                  <td className="is-muted">{stepLabel(stage.currentStep)}</td>
                  <td className="is-muted">{stepLabel(stage.nextStep)}</td>
                  <td>
                    <Link href={`/customers/${stage.customerId}/statement`} style={{ color: "var(--inc-brand-azul)", fontWeight: 500 }}>
                      Registrar contato →
                    </Link>
                  </td>
                </tr>
              ))}
              {stages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="is-empty">
                    Nenhum cliente em atraso.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
