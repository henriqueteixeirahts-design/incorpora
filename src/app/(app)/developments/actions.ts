"use server";

import { redirect } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { createDevelopment } from "@/server/developments";
import type { DevelopmentType } from "@/generated/prisma/client";

export type CreateDevelopmentState = { error?: string };

export async function createDevelopmentAction(
  _prevState: CreateDevelopmentState,
  formData: FormData,
): Promise<CreateDevelopmentState> {
  const context = await requireAccessContext();

  if (!hasPermission(context, "development", "CREATE")) {
    return { error: "Você não tem permissão para criar empreendimentos." };
  }

  const speId = String(formData.get("speId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim() as DevelopmentType;
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();

  if (!speId || !name || !type) {
    return { error: "SPE, nome e tipo são obrigatórios." };
  }

  let development;
  try {
    development = await createDevelopment(context, {
      speId,
      name,
      type,
      city: city || undefined,
      state: state || undefined,
      address: address || undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar empreendimento." };
  }

  redirect(`/developments/${development.id}`);
}
