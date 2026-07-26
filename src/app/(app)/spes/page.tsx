import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listSpesPaged, type SpeSortField } from "@/server/spes";
import { SpesManager } from "./spes-manager";

const PAGE_SIZE = 20;

export default async function SpesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const search = params.q ?? "";
  const sortBy = (params.sort as SpeSortField) ?? "name";
  const sortDir = params.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(params.page) || 1);

  const { items, total } = await listSpesPaged(context.organizationId, {
    search,
    sortBy,
    sortDir,
    page,
    pageSize: PAGE_SIZE,
  });

  const canCreate = hasPermission(context, "spe", "CREATE");
  const canEdit = hasPermission(context, "spe", "EDIT");
  const canDelete = hasPermission(context, "spe", "DELETE");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <h1>SPEs</h1>

      <SpesManager
        spes={items}
        total={total}
        page={page}
        totalPages={totalPages}
        search={search}
        sortBy={sortBy}
        sortDir={sortDir}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
