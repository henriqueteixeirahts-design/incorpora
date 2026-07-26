"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  createDevelopment,
  updateDevelopment,
  deleteDevelopment,
  type CreateDevelopmentInput,
} from "@/server/developments";
import type { DevelopmentType } from "@/generated/prisma/client";

export type CreateDevelopmentState = { error?: string; success?: boolean };

function parseDevelopmentInput(formData: FormData): CreateDevelopmentInput | { error: string } {
  const speId = String(formData.get("speId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim() as DevelopmentType;
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();

  if (!speId || !name || !type) return { error: "SPE, nome e tipo são obrigatórios." };

  return {
    speId,
    name,
    type,
    city: city || undefined,
    state: state || undefined,
    address: address || undefined,
  };
}

export async function createDevelopmentAction(
  _prevState: CreateDevelopmentState,
  formData: FormData,
): Promise<CreateDevelopmentState> {
  const context = await requireAccessContext();

  if (!hasPermission(context, "development", "CREATE")) {
    return { error: "Você não tem permissão para criar empreendimentos." };
  }

  const input = parseDevelopmentInput(formData);
  if ("error" in input) return input;

  let development;
  try {
    development = await createDevelopment(context, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar empreendimento." };
  }

  redirect(`/developments/${development.id}`);
}

export async function updateDevelopmentAction(
  _prevState: CreateDevelopmentState,
  formData: FormData,
): Promise<CreateDevelopmentState> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "EDIT")) {
    return { error: "Você não tem permissão para editar empreendimentos." };
  }

  const developmentId = String(formData.get("developmentId") ?? "");
  if (!developmentId) return { error: "Empreendimento inválido." };

  const input = parseDevelopmentInput(formData);
  if ("error" in input) return input;

  try {
    await updateDevelopment(context, developmentId, input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao atualizar empreendimento." };
  }

  revalidatePath("/developments");
  return { success: true };
}

export async function deleteDevelopmentAction(
  developmentId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "development", "DELETE")) {
    return { error: "Você não tem permissão para excluir empreendimentos." };
  }

  try {
    await deleteDevelopment(context, developmentId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao excluir empreendimento." };
  }

  revalidatePath("/developments");
  return { success: true };
}
