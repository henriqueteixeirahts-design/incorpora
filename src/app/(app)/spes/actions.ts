"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { createSpe, updateSpe, deleteSpe, type CreateSpeInput } from "@/server/spes";

export type CreateSpeState = { error?: string; success?: boolean };

function parseSpeInput(formData: FormData): CreateSpeInput | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const document = String(formData.get("document") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();

  if (!name || !document) return { error: "Nome e CNPJ são obrigatórios." };

  return { name, document, address: address || undefined };
}

export async function createSpeAction(
  _prevState: CreateSpeState,
  formData: FormData,
): Promise<CreateSpeState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "CREATE")) {
    return { error: "Você não tem permissão para criar SPEs." };
  }

  const input = parseSpeInput(formData);
  if ("error" in input) return input;

  try {
    await createSpe(context, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar SPE." };
  }

  revalidatePath("/spes");
  return { success: true };
}

export async function updateSpeAction(
  _prevState: CreateSpeState,
  formData: FormData,
): Promise<CreateSpeState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "EDIT")) {
    return { error: "Você não tem permissão para editar SPEs." };
  }

  const speId = String(formData.get("speId") ?? "");
  if (!speId) return { error: "SPE inválida." };

  const input = parseSpeInput(formData);
  if ("error" in input) return input;

  try {
    await updateSpe(context, speId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar SPE." };
  }

  revalidatePath("/spes");
  return { success: true };
}

export async function deleteSpeAction(
  speId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "DELETE")) {
    return { error: "Você não tem permissão para excluir SPEs." };
  }

  try {
    await deleteSpe(context, speId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao excluir SPE." };
  }

  revalidatePath("/spes");
  return { success: true };
}
