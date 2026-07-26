import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listPayablesPaged, type PayableSortField } from "@/server/payables";
import { listSuppliers, listCostCenters } from "@/server/finance-setup";
import { listDevelopments } from "@/server/developments";
import { listSpes } from "@/server/spes";
import { PayablesManager } from "./payables-manager";

const PAGE_SIZE = 20;

export default async function PayablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const search = params.q ?? "";
  const sortBy = (params.sort as PayableSortField) ?? "dueDate";
  const sortDir = params.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(params.page) || 1);

  const [{ items, total }, suppliers, costCenters, developments, spes] = await Promise.all([
    listPayablesPaged(context.organizationId, {
      search,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    }),
    listSuppliers(context.organizationId),
    listCostCenters(context.organizationId),
    listDevelopments(context.organizationId),
    listSpes(context.organizationId),
  ]);

  const canCreate = hasPermission(context, "payable", "CREATE");
  const canEdit = hasPermission(context, "payable", "EDIT");
  const canApprove = hasPermission(context, "payable", "APPROVE");
  const canCancel = hasPermission(context, "payable", "CANCEL");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <h1>Contas a pagar</h1>

      <PayablesManager
        payables={items.map((p) => ({
          id: p.id,
          description: p.description,
          category: p.category,
          developmentName: p.development?.name ?? null,
          dueDate: p.dueDate.toISOString(),
          amount: Number(p.amount),
          status: p.status,
        }))}
        developments={developments.map((d) => ({ id: d.id, label: d.name }))}
        spes={spes.map((s) => ({ id: s.id, label: s.name }))}
        suppliers={suppliers.map((s) => ({ id: s.id, label: s.name }))}
        costCenters={costCenters.map((c) => ({ id: c.id, label: c.name }))}
        total={total}
        page={page}
        totalPages={totalPages}
        search={search}
        sortBy={sortBy}
        sortDir={sortDir}
        canCreate={canCreate}
        canEdit={canEdit}
        canApprove={canApprove}
        canCancel={canCancel}
      />
    </>
  );
}
