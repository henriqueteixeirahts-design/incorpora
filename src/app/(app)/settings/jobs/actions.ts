"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { runJobManually } from "@/server/jobs";

export async function runJobAction(
  jobName: string,
): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "job", "CREATE")) return { error: "Sem permissão." };

  try {
    const result = await runJobManually(context, jobName);
    revalidatePath("/settings/jobs");
    if (!result.success) {
      return { error: result.error ?? "O job terminou com falha — veja o histórico abaixo para o detalhe." };
    }
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao executar o job." };
  }
}
