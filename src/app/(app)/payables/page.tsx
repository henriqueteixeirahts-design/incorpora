import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listPayablesPaged, countPendingApproval, type PayableSortField } from "@/server/payables";
import { listAllocationTemplates } from "@/server/payable-allocations";
import { listSuppliers, listCostCenters } from "@/server/finance-setup";
import { listDevelopments } from "@/server/developments";
import { listSpes } from "@/server/spes";
import { PayablesManager } from "./payables-manager";
import type { PayableCategory, PayableStatus } from "@/generated/prisma/client";

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
  const pendingApprovalOnly = params.pending === "1";

  const filters = {
    developmentId: params.developmentId || undefined,
    speId: params.speId || undefined,
    supplierId: params.supplierId || undefined,
    costCenterId: params.costCenterId || undefined,
    category: (params.category as PayableCategory) || undefined,
    status: (params.status as PayableStatus) || undefined,
    dueDateFrom: params.dueDateFrom ? new Date(params.dueDateFrom) : undefined,
    dueDateTo: params.dueDateTo ? new Date(params.dueDateTo) : undefined,
    minAmount: params.minAmount ? Number(params.minAmount) : undefined,
    maxAmount: params.maxAmount ? Number(params.maxAmount) : undefined,
    pendingApprovalOnly,
  };

  const [{ items, total }, suppliers, costCenters, developments, spes, pendingCount, allocationTemplates] =
    await Promise.all([
      listPayablesPaged(context, {
        search,
        sortBy,
        sortDir,
        page,
        pageSize: PAGE_SIZE,
        ...filters,
      }),
      listSuppliers(context.organizationId),
      listCostCenters(context),
      listDevelopments(context),
      listSpes(context.organizationId),
      countPendingApproval(context.organizationId),
      listAllocationTemplates(context),
    ]);

  const canCreate = hasPermission(context, "payable", "CREATE");
  const canEdit = hasPermission(context, "payable", "EDIT");
  const canApprove = hasPermission(context, "payable", "APPROVE");
  const canCancel = hasPermission(context, "payable", "CANCEL");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportQs = new URLSearchParams();
  if (search) exportQs.set("q", search);
  Object.entries(params).forEach(([key, value]) => {
    if (value && key !== "page" && key !== "sort" && key !== "dir") exportQs.set(key, value);
  });

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Financeiro</div>
          <h1 className="inc-h1">Contas a pagar</h1>
        </div>
        {canApprove && pendingCount > 0 ? (
          <div className="inc-page-head__actions">
            <span className="inc-pill inc-pill--warn">
              <span className="inc-pill__dot" />
              {pendingCount} conta{pendingCount === 1 ? "" : "s"} pendente{pendingCount === 1 ? "" : "s"} de
              aprovação/avanço no fluxo
            </span>
          </div>
        ) : null}
      </div>

      <PayablesManager
        payables={items.map((p) => ({
          id: p.id,
          description: p.description,
          category: p.category,
          developmentName: p.development?.name ?? null,
          allocationCount: p.allocations.length,
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
        filters={{
          developmentId: params.developmentId ?? "",
          speId: params.speId ?? "",
          supplierId: params.supplierId ?? "",
          costCenterId: params.costCenterId ?? "",
          category: params.category ?? "",
          status: params.status ?? "",
          dueDateFrom: params.dueDateFrom ?? "",
          dueDateTo: params.dueDateTo ?? "",
          minAmount: params.minAmount ?? "",
          maxAmount: params.maxAmount ?? "",
        }}
        pendingApprovalOnly={pendingApprovalOnly}
        exportHref={`/api/payables/export${exportQs.toString() ? `?${exportQs.toString()}` : ""}`}
        allocationTemplates={allocationTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          destinations: t.destinations.map((d) => ({
            developmentId: d.developmentId,
            developmentName: d.development?.name ?? null,
            percent: Number(d.percent),
          })),
        }))}
      />
    </>
  );
}
