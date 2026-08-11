import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listCustomersPaged, type CustomerSortField } from "@/server/customers";
import { CustomersManager } from "./customers-manager";

const TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Pessoa física",
  COMPANY: "Pessoa jurídica",
};

const PAGE_SIZE = 20;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const search = params.q ?? "";
  const sortBy = (params.sort as CustomerSortField) ?? "name";
  const sortDir = params.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(params.page) || 1);

  const { items, total } = await listCustomersPaged(context.organizationId, {
    search,
    sortBy,
    sortDir,
    page,
    pageSize: PAGE_SIZE,
  });

  const canCreate = hasPermission(context, "customer", "CREATE");
  const canEdit = hasPermission(context, "customer", "EDIT");
  const canDelete = hasPermission(context, "customer", "DELETE");
  const canViewStatement = hasPermission(context, "installment", "VIEW");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <h1>Clientes</h1>

      <CustomersManager
        customers={items.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          typeLabel: TYPE_LABELS[c.type] ?? c.type,
          document: c.document,
          email: c.email,
          phone: c.phone,
        }))}
        total={total}
        page={page}
        totalPages={totalPages}
        search={search}
        sortBy={sortBy}
        sortDir={sortDir}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        canViewStatement={canViewStatement}
      />
    </>
  );
}
