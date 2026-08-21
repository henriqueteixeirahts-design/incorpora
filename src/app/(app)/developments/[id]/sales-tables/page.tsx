import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getDevelopment } from "@/server/developments";
import { listSalesTables } from "@/server/sales-tables";
import { listIndexRules } from "@/server/index-rules";
import { NewSalesTableForm } from "./new-sales-table-form";

const DOWN_PAYMENT_DESTINATION_LABELS: Record<string, string> = {
  SPE_ACCOUNT: "SPE",
  BROKER_COMMISSION: "Corretor (comissão)",
};

export default async function SalesTablesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const development = await getDevelopment(context, id);
  if (!development) notFound();

  const [salesTables, indexRules] = await Promise.all([
    listSalesTables(context, id),
    listIndexRules(context.organizationId),
  ]);
  const canCreate = hasPermission(context, "sales_table", "CREATE");

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href={`/developments/${id}`}>← {development.name}</Link>
      </p>
      <h1>Tabelas de venda</h1>

      <table style={{ marginTop: "1.5rem", maxWidth: 900 }}>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Entrada</th>
            <th>Parcelas</th>
            <th>Chaves</th>
            <th>Desconto máx.</th>
            <th>Comissão</th>
            <th>Destino da entrada</th>
            <th>Preços definidos</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {salesTables.map((table) => (
            <tr key={table.id}>
              <td>{table.name}</td>
              <td>{table.downPaymentPercent ? `${table.downPaymentPercent}%` : "—"}</td>
              <td>{table.monthlyInstallments ?? "—"}</td>
              <td>{table.keysInstallmentPercent ? `${table.keysInstallmentPercent}%` : "—"}</td>
              <td>{table.maxDiscountPercent ? `${table.maxDiscountPercent}%` : "—"}</td>
              <td>{table.commissionPercent ? `${table.commissionPercent}%` : "—"}</td>
              <td>{DOWN_PAYMENT_DESTINATION_LABELS[table.downPaymentDestination] ?? table.downPaymentDestination}</td>
              <td>{table._count.units}</td>
              <td>
                <Link href={`/developments/${id}/sales-tables/${table.id}`}>Abrir</Link>
              </td>
            </tr>
          ))}
          {salesTables.length === 0 ? (
            <tr>
              <td colSpan={9} style={{ opacity: 0.7 }}>
                Nenhuma tabela de vendas cadastrada.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {canCreate ? (
        <NewSalesTableForm developmentId={id} indexRules={indexRules.map((r) => ({ id: r.id, name: r.name }))} />
      ) : null}
    </>
  );
}
