"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { settleInternalCommissions } from "@/server/commissions";

export async function settleInternalCommissionAction(
  brokerId: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "payable", "CREATE")) return { error: "Sem permissão." };

  try {
    await settleInternalCommissions(context, brokerId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao liquidar a comissão interna." };
  }

  revalidatePath("/commissions");
  return { success: true };
}
