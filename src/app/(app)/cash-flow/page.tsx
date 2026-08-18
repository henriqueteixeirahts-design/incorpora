import { requireAccessContext } from "@/server/auth-context";
import { getCashFlow, type CashFlowGranularity } from "@/server/cash-flow";
import { listDevelopments } from "@/server/developments";
import { listSpes } from "@/server/spes";
import { CashFlowFiltersForm } from "./cash-flow-filters-form";

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
    getCashFlow(context.organizationId, { developmentId, speId, granularity }),
    listDevelopments(context.organizationId),
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
      <h1>Fluxo de caixa</h1>
      <p style={{ opacity: 0.7, maxWidth: 700 }}>
        Consolida a carteira a receber (corrigida) + recebíveis avulsos − contas a pagar (com rateio aplicado), por
        período de vencimento (previsto) e de lançamento efetivo (realizado). Escopo: <strong>{scopeLabel}</strong>.
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem" }}>
        <CashFlowFiltersForm
          developments={developments.map((d) => ({ id: d.id, label: d.name }))}
          spes={spes.map((s) => ({ id: s.id, label: s.name }))}
          current={{ developmentId: developmentId ?? "", speId: speId ?? "", granularity }}
        />
        <a className="secondary" href={`/api/cash-flow/export${exportQs.toString() ? `?${exportQs.toString()}` : ""}`}>
          Exportar (xlsx)
        </a>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ marginTop: "1.5rem", minWidth: 1100 }}>
          <thead>
            <tr>
              <th>{granularity === "monthly" ? "Mês" : granularity === "weekly" ? "Semana" : "Dia"}</th>
              <th>A receber (previsto)</th>
              <th>Recebido (realizado)</th>
              <th>A pagar (previsto)</th>
              <th>Pago (realizado)</th>
              <th>Saldo {GRANULARITY_LABELS[granularity]} (previsto)</th>
              <th>Saldo {GRANULARITY_LABELS[granularity]} (realizado)</th>
              <th>Diferença</th>
              <th>Saldo acumulado (previsto)</th>
              <th>Saldo acumulado (realizado)</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.period}>
                <td>{formatPeriod(bucket.period, granularity)}</td>
                <td>{formatCurrency(bucket.receivablesForecast)}</td>
                <td>{formatCurrency(bucket.receivablesRealized)}</td>
                <td>{formatCurrency(bucket.payablesForecast)}</td>
                <td>{formatCurrency(bucket.payablesRealized)}</td>
                <td style={{ color: bucket.netForecast < 0 ? "#e03131" : undefined }}>
                  {formatCurrency(bucket.netForecast)}
                </td>
                <td style={{ color: bucket.netRealized < 0 ? "#e03131" : undefined }}>
                  {formatCurrency(bucket.netRealized)}
                </td>
                <td style={{ color: bucket.variance < 0 ? "#e03131" : undefined }}>{formatCurrency(bucket.variance)}</td>
                <td style={{ color: bucket.cumulativeForecast < 0 ? "#e03131" : undefined, fontWeight: 600 }}>
                  {formatCurrency(bucket.cumulativeForecast)}
                </td>
                <td style={{ color: bucket.cumulativeRealized < 0 ? "#e03131" : undefined, fontWeight: 600 }}>
                  {formatCurrency(bucket.cumulativeRealized)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: "1rem", fontSize: "0.8rem", opacity: 0.65, maxWidth: 700 }}>
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

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
