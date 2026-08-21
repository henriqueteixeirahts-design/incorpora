"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  createCustomRole,
  updateCustomRole,
  duplicateRoleForCustomization,
  deleteCustomRole,
} from "@/server/roles";

export type RoleFormState = { error?: string; success?: boolean };

function parsePermissionIds(formData: FormData) {
  return formData.getAll("permissionIds").map(String).filter(Boolean);
}

export async function createRoleAction(_prevState: RoleFormState, formData: FormData): Promise<RoleFormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "role", "CREATE")) {
    return { error: "Você não tem permissão para criar perfis." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Informe o nome do perfil." };
  const description = String(formData.get("description") ?? "").trim();
  const permissionIds = parsePermissionIds(formData);

  try {
    await createCustomRole(context, { name, description, permissionIds });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar perfil." };
  }

  revalidatePath("/settings/roles");
  return { success: true };
}

export async function updateRoleAction(_prevState: RoleFormState, formData: FormData): Promise<RoleFormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "role", "EDIT")) {
    return { error: "Você não tem permissão para editar perfis." };
  }

  const roleId = String(formData.get("roleId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!roleId || !name) return { error: "Informe o nome do perfil." };
  const description = String(formData.get("description") ?? "").trim();
  const permissionIds = parsePermissionIds(formData);

  try {
    await updateCustomRole(context, roleId, { name, description, permissionIds });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar perfil." };
  }

  revalidatePath("/settings/roles");
  return { success: true };
}

export async function duplicateRoleAction(_prevState: RoleFormState, formData: FormData): Promise<RoleFormState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "role", "CREATE")) {
    return { error: "Você não tem permissão para criar perfis." };
  }

  const sourceRoleId = String(formData.get("sourceRoleId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!sourceRoleId || !name) return { error: "Informe o nome do novo perfil." };

  try {
    await duplicateRoleForCustomization(context, sourceRoleId, name);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao duplicar perfil." };
  }

  revalidatePath("/settings/roles");
  return { success: true };
}

export async function deleteRoleAction(roleId: string): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "role", "DELETE")) {
    return { error: "Você não tem permissão para excluir perfis." };
  }

  try {
    await deleteCustomRole(context, roleId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao excluir perfil." };
  }

  revalidatePath("/settings/roles");
  return { success: true };
}
