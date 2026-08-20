import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listOrganizationUsersPaged, listRoles, type UserSortField } from "@/server/users";
import { UsersManager } from "./users-manager";

const PAGE_SIZE = 20;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const search = params.q ?? "";
  const sortBy = (params.sort as UserSortField) ?? "name";
  const sortDir = params.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(params.page) || 1);

  const [{ items, total }, roles] = await Promise.all([
    listOrganizationUsersPaged(context.organizationId, {
      search,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    }),
    listRoles(context.organizationId),
  ]);

  const canCreate = hasPermission(context, "user", "CREATE");
  const canEdit = hasPermission(context, "user", "EDIT");
  const canDelete = hasPermission(context, "user", "DELETE");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Configurações</div>
          <h1 className="inc-h1">Usuários</h1>
        </div>
      </div>

      <UsersManager
        grants={items.map((g) => ({
          id: g.id,
          userId: g.userId,
          fullName: g.user.fullName,
          email: g.user.email,
          roleId: g.roleId,
          roleName: g.role.name,
        }))}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
        currentUserId={context.userId}
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
