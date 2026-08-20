import Link from "next/link";
import { requireAccessContext } from "@/server/auth-context";
import { getCommissionStatement } from "@/server/commissions";
import { listBrokers, listAgencies } from "@/server/crm";
import { formatCurrencyBRL } from "@/lib/format";

const BENEFICIARY_LABELS: Record<string, string> = {
  BROKER: "Corretor",
  AGENCY: "Imobiliária",
  COORDINATOR: "Coordenador",
  MANAGER: "Gerente",
  CAMPAIGN: "Campanha",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "A liberar",
  RELEASED: "Liberada",
  INVOICED: "Faturada",
  PAID: "Paga",
  CANCELLED: "Cancelada",
};

const COMMISSION_STATUS_CHIP: Record<string, string> = {
  PENDING: "reserva",
  RELEASED: "proposta",
  INVOICED: "proposta",
  PAID: "contrato",
  CANCELLED: "atraso",
};

const formatCurrency = formatCurrencyBRL;

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const brokerId = params.brokerId ?? "";
  const agencyId = params.agencyId ?? "";
  const dateFrom = params.dateFrom ?? "";
  const dateTo = params.dateTo ?? "";

  const [{ splits, totals }, brokers, agencies] = await Promise.all([
    getCommissionStatement(context.organizationId, {
      brokerId: brokerId || undefined,
      agencyId: agencyId || undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    }),
    listBrokers(context.organizationId),
    listAgencies(context.organizationId),
  ]);

  const exportQs = new URLSearchParams();
  if (brokerId) exportQs.set("brokerId", brokerId);
  if (agencyId) exportQs.set("agencyId", agencyId);
  if (dateFrom) exportQs.set("dateFrom", dateFrom);
  if (dateTo) exportQs.set("dateTo", dateTo);

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Comercial</div>
          <h1 className="inc-h1">Extrato de comissões</h1>
          <p className="inc-lede">
            Consolidado por corretor/imobiliária — o demonstrativo que se envia ao parceiro
            (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md, Parte 4.2).
          </p>
        </div>
      </div>

      <form
        action="/commissions"
        method="get"
        style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}
      >
        <select name="brokerId" className="inc-select" defaultValue={brokerId}>
          <option value="">Corretor — todos</option>
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select name="agencyId" className="inc-select" defaultValue={agencyId}>
          <option value="">Imobiliária — todas</option>
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--inc-text-soft)" }}>
          De
          <input type="date" name="dateFrom" className="inc-input" defaultValue={dateFrom} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--inc-text-soft)" }}>
          Até
          <input type="date" name="dateTo" className="inc-input" defaultValue={dateTo} />
        </label>
        <button type="submit" className="inc-btn inc-btn--secondary">
          Filtrar
        </button>
        <a href={`/api/commissions/export?${exportQs.toString()}`} className="inc-btn inc-btn--secondary" style={{ marginLeft: "auto" }}>
          Exportar (CSV)
        </a>
      </form>

      <div className="inc-grid-4" style={{ gridTemplateColumns: "repeat(3, 1fr)", maxWidth: 700 }}>
        <div className="inc-kpi">
          <div className="inc-kpi__label">A liberar</div>
          <div className="inc-kpi__value">{formatCurrency(totals.pending)}</div>
        </div>
        <div className="inc-kpi inc-kpi--sky">
          <div className="inc-kpi__label">Liberadas</div>
          <div className="inc-kpi__value">{formatCurrency(totals.released)}</div>
        </div>
        <div className="inc-kpi inc-kpi--gold">
          <div className="inc-kpi__label">Pagas</div>
          <div className="inc-kpi__value">{formatCurrency(totals.paid)}</div>
        </div>
      </div>

      <div className="inc-card">
        <table className="inc-table" style={{ border: 0 }}>
          <thead>
            <tr>
              <th>Venda</th>
              <th>Empreendimento</th>
              <th>Cliente</th>
              <th>Beneficiário</th>
              <th>%</th>
              <th>Valor</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {splits.length === 0 ? (
              <tr>
                <td colSpan={7} className="is-empty">
                  Nenhuma comissão encontrada.
                </td>
              </tr>
            ) : null}
            {splits.map((split) => (
              <tr key={split.id}>
                <td className="is-key">
                  <Link href={`/sales/${split.saleId}`} style={{ color: "inherit", textDecoration: "none" }}>
                    {split.sale.saleNumber}
                  </Link>
                </td>
                <td>{split.sale.development.name}</td>
                <td>{split.sale.customer.name}</td>
                <td className="is-muted">
                  {BENEFICIARY_LABELS[split.beneficiaryType] ?? split.beneficiaryType}
                  {split.label ? ` (${split.label})` : ""}
                </td>
                <td className="is-num">{Number(split.percent)}%</td>
                <td className="is-num">{formatCurrency(Number(split.value))}</td>
                <td>
                  <span className={`inc-chip inc-chip--${COMMISSION_STATUS_CHIP[split.status] ?? "permuta"}`}>
                    {STATUS_LABELS[split.status] ?? split.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
