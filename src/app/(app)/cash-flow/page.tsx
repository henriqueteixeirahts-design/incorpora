import { requireAccessContext } from "@/server/auth-context";
import { getCashFlow, type CashFlowGranularity } from "@/server/cash-flow";
import { listDevelopments } from "@/server/developments";
import { listSpes } from "@/server/spes";
import { CashFlowFiltersForm } from "./cash-flow-filters-form";
import { formatCurrencyBRL } from "@/lib/format";

const GRANULARITY_LABELS: Record<CashFlowGranularity, string> = {
  monthly: "do mês",
  weekly: "da semana",
  daily: "do dia",
};

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const granularity = (params.granularity as CashFlowGranularity) || "monthly";
  const developmentId = params.developmentId || undefined;
  const speId = params.speId || undefined;

  const [buckets, developments, spes] = await Promise.all([
    getCashFlow(context, { developmentId, speId, granularity }),
    listDevelopments(context),
    listSpes(context.organizationId),
  ]);

  const exportQs = new URLSearchParams();
  if (developmentId) exportQs.set("developmentId", developmentId);
  if (speId) exportQs.set("speId", speId);
  if (granularity !== "monthly") exportQs.set("granularity", granularity);

  const scopeLabel = developmentId
    ? developments.find((d) => d.id === developmentId)?.name
    : speId
      ? spes.find((s) => s.id === speId)?.name
      : "Organização (consolidado)";

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Financeiro</div>
          <h1 className="inc-h1">Fluxo de caixa</h1>
          <p className="inc-lede">
            Consolida a carteira a receber (corrigida) + recebíveis avulsos − contas a pagar (com rateio aplicado),
            por período de vencimento (previsto) e de lançamento efetivo (realizado). Escopo:{" "}
            <strong>{scopeLabel}</strong>.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "16px" }}>
        <CashFlowFiltersForm
          developments={developments.map((d) => ({ id: d.id, label: d.name }))}
          spes={spes.map((s) => ({ id: s.id, label: s.name }))}
          current={{ developmentId: developmentId ?? "", speId: speId ?? "", granularity }}
        />
        <a className="inc-btn inc-btn--secondary" href={`/api/cash-flow/export${exportQs.toString() ? `?${exportQs.toString()}` : ""}`}>
          Exportar (xlsx)
        </a>
      </div>

      <div className="inc-card" style={{ marginTop: "16px", overflowX: "auto" }}>
        <table className="inc-table" style={{ border: 0, minWidth: 1100 }}>
          <thead>
            <tr>
              <th>{granularity === "monthly" ? "Mês" : granularity === "weekly" ? "Semana" : "Dia"}</th>
              <th className="is-num">A receber (previsto)</th>
              <th className="is-num">Recebido (realizado)</th>
              <th className="is-num">A pagar (previsto)</th>
              <th className="is-num">Pago (realizado)</th>
              <th className="is-num">Saldo {GRANULARITY_LABELS[granularity]} (previsto)</th>
              <th className="is-num">Saldo {GRANULARITY_LABELS[granularity]} (realizado)</th>
              <th className="is-num">Diferença</th>
              <th className="is-num">Saldo acumulado (previsto)</th>
              <th className="is-num">Saldo acumulado (realizado)</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.period}>
                <td className="is-key">{formatPeriod(bucket.period, granularity)}</td>
                <td className="is-num is-muted">{formatCurrency(bucket.receivablesForecast)}</td>
                <td className="is-num is-muted">{formatCurrency(bucket.receivablesRealized)}</td>
                <td className="is-num is-muted">{formatCurrency(bucket.payablesForecast)}</td>
                <td className="is-num is-muted">{formatCurrency(bucket.payablesRealized)}</td>
                <td className="is-num" style={{ color: bucket.netForecast < 0 ? "var(--inc-danger)" : undefined }}>
                  {formatCurrency(bucket.netForecast)}
                </td>
                <td className="is-num" style={{ color: bucket.netRealized < 0 ? "var(--inc-danger)" : undefined }}>
                  {formatCurrency(bucket.netRealized)}
                </td>
                <td className="is-num" style={{ color: bucket.variance < 0 ? "var(--inc-danger)" : undefined }}>
                  {formatCurrency(bucket.variance)}
                </td>
                <td className="is-num is-strong" style={{ color: bucket.cumulativeForecast < 0 ? "var(--inc-danger)" : undefined }}>
                  {formatCurrency(bucket.cumulativeForecast)}
                </td>
                <td className="is-num is-strong" style={{ color: bucket.cumulativeRealized < 0 ? "var(--inc-danger)" : undefined }}>
                  {formatCurrency(bucket.cumulativeRealized)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="inc-help" style={{ marginTop: "12px", maxWidth: 700 }}>
        O saldo acumulado parte do saldo inicial das contas bancárias do escopo (lançado manualmente em Configurações
        → Fornecedores/centros de custo/contas bancárias — a conciliação automática da Fase 2 passa a alimentar isso
        sozinha).
      </p>
    </>
  );
}

function formatPeriod(key: string, granularity: CashFlowGranularity) {
  if (granularity === "monthly") {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  }
  if (granularity === "daily") {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  return key; // "YYYY-Www"
}

const formatCurrency = formatCurrencyBRL;
