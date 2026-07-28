import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getSalesTable } from "@/server/sales-tables";
import { listUnits } from "@/server/units";
import { SetUnitPriceForm } from "./set-unit-price-form";

export default async function SalesTableDetailPage({
  params,
}: {
  params: Promise<{ id: string; tableId: string }>;
}) {
  const { id, tableId } = await params;
  const context = await requireAccessContext();

  const salesTable = await getSalesTable(context.organizationId, tableId);
  if (!salesTable || salesTable.developmentId !== id) notFound();

  const units = await listUnits(salesTable.developmentId);
  const principalUnits = units.filter((unit) => !unit.isAccessory);
  const canEdit = hasPermission(context, "sales_table", "EDIT");

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href={`/developments/${id}/sales-tables`}>← Tabelas de venda</Link>
      </p>
      <h1>{salesTable.name}</h1>

      <table style={{ marginTop: "1.5rem", maxWidth: 600 }}>
        <thead>
          <tr>
            <th>Unidade</th>
            <th>Preço</th>
            <th>R$/m²</th>
          </tr>
        </thead>
        <tbody>
          {salesTable.units.map((entry) => (
            <tr key={entry.id}>
              <td>{entry.unit.number}</td>
              <td>{formatCurrency(Number(entry.price))}</td>
              <td>{entry.pricePerSqm ? formatCurrency(Number(entry.pricePerSqm)) : "—"}</td>
            </tr>
          ))}
          {salesTable.units.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ opacity: 0.7 }}>
                Nenhum preço definido ainda.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {canEdit ? (
        <SetUnitPriceForm
          developmentId={id}
          salesTableId={tableId}
          units={principalUnits.map((unit) => ({ id: unit.id, number: unit.number }))}
        />
      ) : null}
    </>
  );
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
