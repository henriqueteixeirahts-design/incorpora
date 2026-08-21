import { requireAccessContext } from "@/server/auth-context";
import {
  listConsolidatedReceivables,
  summarizeConsolidatedReceivables,
  CONSOLIDATED_ORIGIN_LABELS,
  CONSOLIDATED_STATUS_LABELS,
  type ConsolidatedReceivableOrigin,
  type ConsolidatedReceivableStatus,
} from "@/server/receivables-consolidated";
import { listDevelopments } from "@/server/developments";
import { listSpes } from "@/server/spes";
import { ConsolidatedFiltersForm } from "./consolidated-filters-form";
import { formatCurrencyBRL as formatCurrency, formatCalendarDateBR } from "@/lib/format";

export default async function ConsolidatedReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const filters = {
    origin: (params.origin as ConsolidatedReceivableOrigin) || undefined,
    developmentId: params.developmentId || undefined,
    speId: params.speId || undefined,
    status: (params.status as ConsolidatedReceivableStatus) || undefined,
    dateFrom: params.dateFrom ? new Date(params.dateFrom) : undefined,
    dateTo: params.dateTo ? new Date(params.dateTo) : undefined,
  };

  const [rows, developments, spes] = await Promise.all([
    listConsolidatedReceivables(context, filters),
    listDevelopments(context),
    listSpes(context.organizationId),
  ]);

  const totals = summarizeConsolidatedReceivables(rows);

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Financeiro</div>
          <h1 className="inc-h1">Contas a receber consolidado</h1>
          <p className="inc-lede">
            Carteira de vendas, recebíveis avulsos e aportes de investidores num só lugar — contraparte do Contas a
            pagar. Aporte é funding, não receita: some aqui e no fluxo de caixa, nunca nos relatórios de resultado.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", margin: "1rem 0" }}>
        {(["SALES", "AVULSO", "INVESTOR_CONTRIBUTION"] as const).map((origin) => (
          <div key={origin} className="inc-card" style={{ padding: "12px 16px" }}>
            <p className="field-hint" style={{ padding: 0 }}>{CONSOLIDATED_ORIGIN_LABELS[origin]}</p>
            <strong>{formatCurrency(totals.byOrigin[origin])}</strong>
          </div>
        ))}
        <div className="inc-card" style={{ padding: "12px 16px" }}>
          <p className="field-hint" style={{ padding: 0 }}>Total geral</p>
          <strong>{formatCurrency(totals.overall)}</strong>
        </div>
      </div>

      <ConsolidatedFiltersForm
        developments={developments.map((d) => ({ id: d.id, label: d.name }))}
        spes={spes.map((s) => ({ id: s.id, label: s.name }))}
        current={{
          origin: params.origin ?? "",
          developmentId: params.developmentId ?? "",
          speId: params.speId ?? "",
          status: params.status ?? "",
          dateFrom: params.dateFrom ?? "",
          dateTo: params.dateTo ?? "",
        }}
      />

      {rows.length === 0 ? (
        <p className="field-hint" style={{ marginTop: "1rem" }}>Nenhum lançamento encontrado com esses filtros.</p>
      ) : (
        <table className="inc-table" style={{ marginTop: "1rem" }}>
          <thead>
            <tr>
              <th>Origem</th>
              <th>Descrição</th>
              <th>Empreendimento/SPE</th>
              <th>Vencimento</th>
              <th>Valor</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.origin}-${row.id}`}>
                <td>{CONSOLIDATED_ORIGIN_LABELS[row.origin]}</td>
                <td>{row.description}</td>
                <td className="is-muted">{row.developmentName ?? row.speName ?? "—"}</td>
                <td className="is-muted">{formatCalendarDateBR(row.dueDate)}</td>
                <td className="is-num">{formatCurrency(row.amount)}</td>
                <td>{CONSOLIDATED_STATUS_LABELS[row.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
