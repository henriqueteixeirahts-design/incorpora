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
      <h1>Extrato de comissões</h1>
      <p style={{ opacity: 0.7, maxWidth: 680 }}>
        Consolidado por corretor/imobiliária — o demonstrativo que se envia ao parceiro
        (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md, Parte 4.2).
      </p>

      <form className="list-toolbar" action="/commissions" method="get" style={{ flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
        <select name="brokerId" defaultValue={brokerId}>
          <option value="">Corretor — todos</option>
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select name="agencyId" defaultValue={agencyId}>
          <option value="">Imobiliária — todas</option>
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
          De
          <input type="date" name="dateFrom" defaultValue={dateFrom} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
          Até
          <input type="date" name="dateTo" defaultValue={dateTo} />
        </label>
        <button type="submit" className="secondary">
          Filtrar
        </button>
        <a href={`/api/commissions/export?${exportQs.toString()}`} className="secondary" style={{ marginLeft: "auto" }}>
          Exportar (CSV)
        </a>
      </form>

      <div className="field-grid" style={{ marginTop: "1.5rem", maxWidth: 600 }}>
        <div>
          <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>A liberar</p>
          <p>{formatCurrency(totals.pending)}</p>
        </div>
        <div>
          <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Liberadas</p>
          <p>{formatCurrency(totals.released)}</p>
        </div>
        <div>
          <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>Pagas</p>
          <p>{formatCurrency(totals.paid)}</p>
        </div>
      </div>

      <table className="data-table" style={{ marginTop: "1.5rem" }}>
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
              <td colSpan={7} style={{ opacity: 0.7 }}>
                Nenhuma comissão encontrada.
              </td>
            </tr>
          ) : null}
          {splits.map((split) => (
            <tr key={split.id}>
              <td>
                <Link href={`/sales/${split.saleId}`}>{split.sale.saleNumber}</Link>
              </td>
              <td>{split.sale.development.name}</td>
              <td>{split.sale.customer.name}</td>
              <td>
                {BENEFICIARY_LABELS[split.beneficiaryType] ?? split.beneficiaryType}
                {split.label ? ` (${split.label})` : ""}
              </td>
              <td>{Number(split.percent)}%</td>
              <td>{formatCurrency(Number(split.value))}</td>
              <td>{STATUS_LABELS[split.status] ?? split.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
