import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listSales } from "@/server/sales";
import { listBrokers, listAgencies } from "@/server/crm";
import { CommissionSplitForm } from "./commission-split-form";

const COMMISSION_BENEFICIARY_LABELS: Record<string, string> = {
  BROKER: "Corretor",
  AGENCY: "Imobiliária",
  COORDINATOR: "Coordenador",
  MANAGER: "Gerente",
  CAMPAIGN: "Campanha",
};

export default async function SalesPage() {
  const context = await requireAccessContext();
  const [sales, brokers, agencies] = await Promise.all([
    listSales(context.organizationId),
    listBrokers(context.organizationId),
    listAgencies(context.organizationId),
  ]);
  const canEditCommission = hasPermission(context, "sale", "EDIT");

  return (
    <>
      <h1>Vendas</h1>

      {sales.map((sale) => (
        <div
          key={sale.id}
          style={{
            border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
            borderRadius: 8,
            padding: "0.75rem 1rem",
            marginTop: "0.75rem",
            maxWidth: 800,
          }}
        >
          <p>
            <strong>{sale.development.name}</strong> — {sale.unit.number} — {sale.customer.name}
          </p>
          <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
            {formatCurrency(Number(sale.salePrice))} em{" "}
            {new Date(sale.saleDate).toLocaleDateString("pt-BR")}
          </p>

          {sale.commissionSplits.length > 0 ? (
            <ul style={{ marginTop: "0.5rem", paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
              {sale.commissionSplits.map((split) => (
                <li key={split.id}>
                  {COMMISSION_BENEFICIARY_LABELS[split.beneficiaryType]}
                  {split.label ? ` (${split.label})` : ""} — {Number(split.percent)}% —{" "}
                  {formatCurrency(Number(split.value))} — {split.status}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: "0.4rem" }}>
              Nenhuma comissão lançada.
            </p>
          )}

          {canEditCommission ? (
            <CommissionSplitForm
              saleId={sale.id}
              brokers={brokers.map((b) => ({ id: b.id, label: b.name }))}
              agencies={agencies.map((a) => ({ id: a.id, label: a.name }))}
            />
          ) : null}
        </div>
      ))}
      {sales.length === 0 ? <p style={{ opacity: 0.7 }}>Nenhuma venda registrada.</p> : null}
    </>
  );
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
