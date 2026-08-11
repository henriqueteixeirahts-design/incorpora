import Link from "next/link";
import { requireAccessContext } from "@/server/auth-context";
import { getPortfolioAging, getOverdueCustomerStages, AGING_BUCKET_ORDER, type AgingBucketKey } from "@/server/aging";
import { listDevelopments } from "@/server/developments";
import { listSpes } from "@/server/spes";
import { IndexFreshnessBanner } from "@/components/IndexFreshnessBanner";
import { AgingFiltersForm } from "./aging-filters-form";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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
      <h1>Inadimplência</h1>
      <p style={{ opacity: 0.7 }}>
        Aging da carteira por faixa de atraso e régua de cobrança assistida (docs/ESPEC_FASE_B_CARTEIRA_FINANCEIRO_1.md,
        Parte 3). Valores calculados ao vivo (índice + multa + juros de mora).
      </p>

      <IndexFreshnessBanner organizationId={context.organizationId} />

      <AgingFiltersForm
        developments={developments.map((d) => ({ id: d.id, label: d.name }))}
        spes={spes.map((s) => ({ id: s.id, label: s.name }))}
        current={{ developmentId, speId, minValue, maxValue }}
      />

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.25rem" }}>
        <Link
          href={bucketLink(null)}
          className={!selectedBucket ? "active" : undefined}
          style={{
            border: "1px solid color-mix(in srgb, var(--foreground) 15%, transparent)",
            borderRadius: 8,
            padding: "0.6rem 0.9rem",
            minWidth: 130,
            background: !selectedBucket ? "color-mix(in srgb, var(--foreground) 8%, transparent)" : undefined,
          }}
        >
          <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Todos</p>
          <p style={{ fontWeight: 600 }}>{formatCurrency(aging.summaries.reduce((s, b) => s + b.totalValue, 0))}</p>
          <p style={{ fontSize: "0.75rem", opacity: 0.7 }}>
            {aging.summaries.reduce((s, b) => s + b.installmentCount, 0)} parcela(s)
          </p>
        </Link>
        {aging.summaries.map((bucket) => (
          <Link
            key={bucket.bucket}
            href={bucketLink(bucket.bucket)}
            style={{
              border: "1px solid color-mix(in srgb, var(--foreground) 15%, transparent)",
              borderRadius: 8,
              padding: "0.6rem 0.9rem",
              minWidth: 130,
              background: selectedBucket === bucket.bucket ? "color-mix(in srgb, var(--foreground) 8%, transparent)" : undefined,
            }}
          >
            <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>{bucket.label}</p>
            <p style={{ fontWeight: 600 }}>{formatCurrency(bucket.totalValue)}</p>
            <p style={{ fontSize: "0.75rem", opacity: 0.7 }}>
              {bucket.installmentCount} parcela(s) · {bucket.customerCount} cliente(s)
            </p>
          </Link>
        ))}
      </div>

      <table style={{ marginTop: "1.5rem", maxWidth: 1000 }}>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Empreendimento / Unidade</th>
            <th>Parcela</th>
            <th>Vencimento</th>
            <th>Dias em atraso</th>
            <th>Valor corrigido</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.installmentId}>
              <td>
                <Link href={`/customers/${row.customerId}/statement`}>{row.customerName}</Link>
              </td>
              <td>
                {row.developmentName} — {row.unitNumber}
              </td>
              <td>{row.label}</td>
              <td>{new Date(row.dueDate).toLocaleDateString("pt-BR")}</td>
              <td>{row.daysOverdue}</td>
              <td>{formatCurrency(row.resultValue)}</td>
              <td>
                <Link href={`/sales/${row.saleId}`}>Ver carteira →</Link>
              </td>
            </tr>
          ))}
          {visibleRows.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ opacity: 0.7 }}>
                Nenhuma parcela nessa faixa.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Régua de cobrança — clientes em atraso</h2>
        <p style={{ opacity: 0.7, fontSize: "0.85rem", maxWidth: 640 }}>
          Etapa assistida: a régua não dispara sozinha ainda — o painel mostra em que etapa cada cliente está e a
          próxima ação sugerida; o registro do contato feito fica no extrato do cliente.
        </p>
        <table style={{ marginTop: "0.75rem", maxWidth: 1000 }}>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Dias em atraso (pior parcela)</th>
              <th>Etapa atual</th>
              <th>Próxima ação sugerida</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => (
              <tr key={stage.customerId}>
                <td>{stage.customerName}</td>
                <td>{stage.worstDaysOverdue}</td>
                <td>{stepLabel(stage.currentStep)}</td>
                <td>{stepLabel(stage.nextStep)}</td>
                <td>
                  <Link href={`/customers/${stage.customerId}/statement`}>Registrar contato →</Link>
                </td>
              </tr>
            ))}
            {stages.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ opacity: 0.7 }}>
                  Nenhum cliente em atraso.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}
