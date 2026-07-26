"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { inviteUser, updateUserRole, revokeUserAccess } from "@/server/users";

export type InviteUserState = { error?: string; success?: boolean };

export async function inviteUserAction(
  _prevState: InviteUserState,
  formData: FormData,
): Promise<InviteUserState> {
  const context = await requireAccessContext();

  if (!hasPermission(context, "user", "CREATE")) {
    return { error: "Você não tem permissão para convidar usuários." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const roleId = String(formData.get("roleId") ?? "").trim();

  if (!email || !fullName || !roleId) {
    return { error: "Preencha nome, e-mail e papel." };
  }

  try {
    await inviteUser(context, { email, fullName, roleId });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao convidar usuário." };
  }

  revalidatePath("/settings/users");
  return { success: true };
}

export async function updateUserRoleAction(
  _prevState: InviteUserState,
  formData: FormData,
): Promise<InviteUserState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "user", "EDIT")) {
    return { error: "Você não tem permissão para editar usuários." };
  }

  const grantId = String(formData.get("grantId") ?? "");
  const roleId = String(formData.get("roleId") ?? "").trim();
  if (!grantId || !roleId) return { error: "Selecione um papel." };

  try {
    await updateUserRole(context, grantId, roleId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar papel." };
  }

  revalidatePath("/settings/users");
  return { success: true };
}

export async function revokeUserAccessAction(
  grantId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "user", "DELETE")) {
    return { error: "Você não tem permissão para revogar acesso." };
  }

  try {
    await revokeUserAccess(context, grantId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao revogar acesso." };
  }

  revalidatePath("/settings/users");
  return { success: true };
}
