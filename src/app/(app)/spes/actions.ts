"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { createSpe } from "@/server/spes";

export type CreateSpeState = { error?: string };

export async function createSpeAction(
  _prevState: CreateSpeState,
  formData: FormData,
): Promise<CreateSpeState> {
  const context = await requireAccessContext();

  if (!hasPermission(context, "spe", "CREATE")) {
    return { error: "Você não tem permissão para criar SPEs." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const document = String(formData.get("document") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();

  if (!name || !document) {
    return { error: "Nome e CNPJ são obrigatórios." };
  }

  await createSpe(context, { name, document, address: address || undefined });

  revalidatePath("/spes");
  return {};
}
