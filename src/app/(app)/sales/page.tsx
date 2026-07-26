import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listSalesPaged, type SaleSortField } from "@/server/sales";
import { listBrokers, listAgencies } from "@/server/crm";
import { SalesManager } from "./sales-manager";

const PAGE_SIZE = 20;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const search = params.q ?? "";
  const sortBy = (params.sort as SaleSortField) ?? "saleDate";
  const sortDir = params.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(params.page) || 1);

  const [{ items, total }, brokers, agencies] = await Promise.all([
    listSalesPaged(context.organizationId, {
      search,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    }),
    listBrokers(context.organizationId),
    listAgencies(context.organizationId),
  ]);

  const canEditCommission = hasPermission(context, "sale", "EDIT");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <h1>Vendas</h1>

      <SalesManager
        sales={items.map((sale) => ({
          id: sale.id,
          developmentName: sale.development.name,
          unitNumber: sale.unit.number,
          customerName: sale.customer.name,
          salePrice: Number(sale.salePrice),
          saleDate: sale.saleDate.toISOString(),
          commissionSplits: sale.commissionSplits.map((split) => ({
            id: split.id,
            beneficiaryType: split.beneficiaryType,
            label: split.label,
            percent: Number(split.percent),
            value: Number(split.value),
            status: split.status,
          })),
        }))}
        brokers={brokers.map((b) => ({ id: b.id, label: b.name }))}
        agencies={agencies.map((a) => ({ id: a.id, label: a.name }))}
        total={total}
        page={page}
        totalPages={totalPages}
        search={search}
        sortBy={sortBy}
        sortDir={sortDir}
        canEditCommission={canEditCommission}
      />
    </>
  );
}
