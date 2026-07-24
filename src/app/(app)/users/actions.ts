"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { inviteUser } from "@/server/users";

export type InviteUserState = { error?: string };

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
    return {
      error: error instanceof Error ? error.message : "Falha ao convidar usuário.",
    };
  }

  revalidatePath("/users");
  return {};
}
