"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { inviteUser, updateUserAccess, revokeUserAccess } from "@/server/users";

export type InviteUserState = { error?: string; success?: boolean };

function parseDevelopmentIds(formData: FormData): string[] | null {
  if (formData.get("allDevelopments") === "on") return null;
  return formData.getAll("developmentIds").map(String).filter(Boolean);
}

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

  const developmentIds = parseDevelopmentIds(formData);
  if (developmentIds && developmentIds.length === 0) {
    return { error: "Selecione ao menos um empreendimento, ou marque \"Todos os empreendimentos\"." };
  }

  try {
    await inviteUser(context, { email, fullName, roleId, developmentIds });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao convidar usuário." };
  }

  revalidatePath("/settings/users");
  return { success: true };
}

export async function updateUserAccessAction(
  _prevState: InviteUserState,
  formData: FormData,
): Promise<InviteUserState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "user", "EDIT")) {
    return { error: "Você não tem permissão para editar usuários." };
  }

  const userId = String(formData.get("userId") ?? "");
  const roleId = String(formData.get("roleId") ?? "").trim();
  if (!userId || !roleId) return { error: "Selecione um papel." };

  const developmentIds = parseDevelopmentIds(formData);
  if (developmentIds && developmentIds.length === 0) {
    return { error: "Selecione ao menos um empreendimento, ou marque \"Todos os empreendimentos\"." };
  }

  try {
    await updateUserAccess(context, userId, { roleId, developmentIds });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar acesso." };
  }

  revalidatePath("/settings/users");
  return { success: true };
}

export async function revokeUserAccessAction(
  userId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "user", "DELETE")) {
    return { error: "Você não tem permissão para revogar acesso." };
  }

  try {
    await revokeUserAccess(context, userId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao revogar acesso." };
  }

  revalidatePath("/settings/users");
  return { success: true };
}
