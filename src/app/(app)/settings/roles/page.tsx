import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listRolesWithPermissions, listPermissionsCatalog } from "@/server/roles";
import { RolesManager } from "./roles-manager";

export default async function RolesPage() {
  const context = await requireAccessContext();

  const [roles, permissions] = await Promise.all([
    listRolesWithPermissions(context),
    listPermissionsCatalog(),
  ]);

  const canCreate = hasPermission(context, "role", "CREATE");
  const canEdit = hasPermission(context, "role", "EDIT");
  const canDelete = hasPermission(context, "role", "DELETE");

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Configurações</div>
          <h1 className="inc-h1">Perfis de acesso</h1>
        </div>
      </div>
      <p className="inc-lede">
        Cada perfil define o que os usuários atribuídos a ele podem ver e fazer, por módulo e ação. Perfis de
        sistema são somente leitura — duplique um pra criar uma versão customizada da sua organização.
      </p>

      <RolesManager
        roles={roles.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
          userCount: r._count.accessGrants,
          permissionIds: r.permissions.map((p) => p.permissionId),
        }))}
        permissions={permissions.map((p) => ({ id: p.id, resource: p.resource, action: p.action }))}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
