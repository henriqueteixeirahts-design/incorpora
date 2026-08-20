import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listReceivablesPaged, type ReceivableSortField } from "@/server/receivables-avulsos";
import { listDevelopments } from "@/server/developments";
import { listSpes } from "@/server/spes";
import { listCustomers } from "@/server/customers";
import { ReceivablesManager } from "./receivables-manager";
import type { ReceivableCategory, ReceivableStatus } from "@/generated/prisma/client";

const PAGE_SIZE = 20;

export default async function ReceivablesAvulsosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const search = params.q ?? "";
  const sortBy = (params.sort as ReceivableSortField) ?? "dueDate";
  const sortDir = params.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(params.page) || 1);

  const filters = {
    developmentId: params.developmentId || undefined,
    speId: params.speId || undefined,
    customerId: params.customerId || undefined,
    category: (params.category as ReceivableCategory) || undefined,
    status: (params.status as ReceivableStatus) || undefined,
    dueDateFrom: params.dueDateFrom ? new Date(params.dueDateFrom) : undefined,
    dueDateTo: params.dueDateTo ? new Date(params.dueDateTo) : undefined,
    minAmount: params.minAmount ? Number(params.minAmount) : undefined,
    maxAmount: params.maxAmount ? Number(params.maxAmount) : undefined,
  };

  const [{ items, total }, developments, spes, customers] = await Promise.all([
    listReceivablesPaged(context.organizationId, { search, sortBy, sortDir, page, pageSize: PAGE_SIZE, ...filters }),
    listDevelopments(context.organizationId),
    listSpes(context.organizationId),
    listCustomers(context.organizationId),
  ]);

  const canCreate = hasPermission(context, "installment", "CREATE");
  const canEdit = hasPermission(context, "installment", "EDIT");
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
          <h1 className="inc-h1">Recebíveis avulsos</h1>
          <p className="inc-lede">
            Entradas que não nascem de venda — taxa de cessão, aluguel de espaço, reembolso, rendimento. Separado da
            carteira de vendas: nunca acumula correção por índice/juros contratuais.
          </p>
        </div>
      </div>

      <ReceivablesManager
        receivables={items.map((r) => ({
          id: r.id,
          origin: r.origin,
          category: r.category,
          developmentName: r.development?.name ?? null,
          customerName: r.customer?.name ?? null,
          dueDate: r.dueDate.toISOString(),
          amount: Number(r.amount),
          status: r.status,
          isFromAssignment: !!r.contractAssignmentId,
        }))}
        developments={developments.map((d) => ({ id: d.id, label: d.name }))}
        spes={spes.map((s) => ({ id: s.id, label: s.name }))}
        customers={customers.map((c) => ({ id: c.id, label: c.name }))}
        total={total}
        page={page}
        totalPages={totalPages}
        search={search}
        sortBy={sortBy}
        sortDir={sortDir}
        canCreate={canCreate}
        canEdit={canEdit}
        filters={{
          developmentId: params.developmentId ?? "",
          speId: params.speId ?? "",
          customerId: params.customerId ?? "",
          category: params.category ?? "",
          status: params.status ?? "",
          dueDateFrom: params.dueDateFrom ?? "",
          dueDateTo: params.dueDateTo ?? "",
          minAmount: params.minAmount ?? "",
          maxAmount: params.maxAmount ?? "",
        }}
        exportHref={`/api/receivables/avulsos/export${exportQs.toString() ? `?${exportQs.toString()}` : ""}`}
      />
    </>
  );
}
