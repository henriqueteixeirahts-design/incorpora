import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listSuppliersPaged, listCostCentersPaged, type SupplierSortField, type CostCenterSortField } from "@/server/finance-setup";
import { listDevelopments } from "@/server/developments";
import { SuppliersManager } from "./suppliers-manager";
import { CostCentersManager } from "./cost-centers-manager";

const PAGE_SIZE = 20;

export default async function FinanceSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const spSearch = params.sq ?? "";
  const spSortBy = (params.ssort as SupplierSortField) ?? "name";
  const spSortDir = params.sdir === "desc" ? "desc" : "asc";
  const spPage = Math.max(1, Number(params.spage) || 1);

  const ccSearch = params.cq ?? "";
  const ccSortBy = (params.csort as CostCenterSortField) ?? "name";
  const ccSortDir = params.cdir === "desc" ? "desc" : "asc";
  const ccPage = Math.max(1, Number(params.cpage) || 1);

  const [suppliersResult, costCentersResult, developments] = await Promise.all([
    listSuppliersPaged(context.organizationId, {
      search: spSearch,
      sortBy: spSortBy,
      sortDir: spSortDir,
      page: spPage,
      pageSize: PAGE_SIZE,
    }),
    listCostCentersPaged(context.organizationId, {
      search: ccSearch,
      sortBy: ccSortBy,
      sortDir: ccSortDir,
      page: ccPage,
      pageSize: PAGE_SIZE,
    }),
    listDevelopments(context.organizationId),
  ]);

  const canCreateSupplier = hasPermission(context, "supplier", "CREATE");
  const canEditSupplier = hasPermission(context, "supplier", "EDIT");
  const canDeleteSupplier = hasPermission(context, "supplier", "DELETE");
  const canCreateCostCenter = hasPermission(context, "cost_center", "CREATE");
  const canEditCostCenter = hasPermission(context, "cost_center", "EDIT");
  const canDeleteCostCenter = hasPermission(context, "cost_center", "DELETE");

  return (
    <>
      <h1>Fornecedores e centros de custo</h1>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Fornecedores</h2>
        <SuppliersManager
          suppliers={suppliersResult.items}
          total={suppliersResult.total}
          page={spPage}
          totalPages={Math.max(1, Math.ceil(suppliersResult.total / PAGE_SIZE))}
          search={spSearch}
          sortBy={spSortBy}
          sortDir={spSortDir}
          canCreate={canCreateSupplier}
          canEdit={canEditSupplier}
          canDelete={canDeleteSupplier}
        />
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Centros de custo</h2>
        <CostCentersManager
          costCenters={costCentersResult.items.map((cc) => ({
            id: cc.id,
            name: cc.name,
            developmentId: cc.developmentId,
            developmentName: cc.development?.name ?? null,
          }))}
          developments={developments.map((d) => ({ id: d.id, name: d.name }))}
          total={costCentersResult.total}
          page={ccPage}
          totalPages={Math.max(1, Math.ceil(costCentersResult.total / PAGE_SIZE))}
          search={ccSearch}
          sortBy={ccSortBy}
          sortDir={ccSortDir}
          canCreate={canCreateCostCenter}
          canEdit={canEditCostCenter}
          canDelete={canDeleteCostCenter}
        />
      </section>
    </>
  );
}
