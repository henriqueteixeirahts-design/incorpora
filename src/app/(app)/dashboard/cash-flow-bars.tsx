import type { CashFlowBucket } from "@/server/cash-flow";

function formatMonthLabel(period: string) {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

export function CashFlowBars({ buckets }: { buckets: CashFlowBucket[] }) {
  const max = Math.max(1, ...buckets.flatMap((b) => [b.receivablesForecast, b.payablesForecast]));

  return (
    <div style={{ marginTop: "18px", display: "flex", alignItems: "flex-end", gap: "12px", height: "118px" }}>
      {buckets.map((bucket) => (
        <div
          key={bucket.period}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "7px",
            height: "100%",
            justifyContent: "flex-end",
          }}
        >
          <div style={{ width: "100%", display: "flex", gap: "3px", alignItems: "flex-end", height: "100%" }}>
            <div
              style={{
                flex: 1,
                background: "var(--inc-brand-azul-claro)",
                borderRadius: "1px",
                height: `${(bucket.receivablesForecast / max) * 100}%`,
              }}
            />
            <div
              style={{
                flex: 1,
                background: "var(--inc-brand-dourado)",
                borderRadius: "1px",
                height: `${(bucket.payablesForecast / max) * 100}%`,
              }}
            />
          </div>
          <div style={{ fontSize: "11px", color: "var(--inc-text-muted)", fontWeight: 500 }}>
            {formatMonthLabel(bucket.period)}
          </div>
        </div>
      ))}
    </div>
  );
}
