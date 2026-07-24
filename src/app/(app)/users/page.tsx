import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listOrganizationUsers, listRoles } from "@/server/users";
import { InviteUserForm } from "./invite-user-form";

export default async function UsersPage() {
  const context = await requireAccessContext();
  const [grants, roles] = await Promise.all([
    listOrganizationUsers(context.organizationId),
    listRoles(context.organizationId),
  ]);
  const canInvite = hasPermission(context, "user", "CREATE");

  return (
    <>
      <h1>Usuários</h1>

      <table style={{ marginTop: "1.5rem", maxWidth: 720 }}>
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Papel</th>
          </tr>
        </thead>
        <tbody>
          {grants.map((grant) => (
            <tr key={grant.id}>
              <td>{grant.user.fullName}</td>
              <td>{grant.user.email}</td>
              <td>{grant.role.name}</td>
            </tr>
          ))}
          {grants.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ opacity: 0.7 }}>
                Nenhum usuário com acesso à organização ainda.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {canInvite ? <InviteUserForm roles={roles} /> : null}
    </>
  );
}
