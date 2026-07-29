"use server";

import { revalidatePath } from "next/cache";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getAuditRunDetail } from "@/server/audit";
import { runJobManually } from "@/server/jobs";

export async function reverifyNowAction(): Promise<{ error?: string; success?: boolean }> {
  const context = await requireAccessContext();
  if (!hasPermission(context, "audit", "CREATE")) return { error: "Sem permissão." };

  try {
    const result = await runJobManually(context, "audit-update-full");
    revalidatePath("/settings/audit");
    if (!result.success) {
      return { error: result.error ?? "A verificação encontrou problemas — veja o detalhe abaixo." };
    }
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao rodar a auditoria." };
  }
}

export async function getAuditRunDetailAction(auditRunId: string) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "audit", "VIEW")) return null;
  return getAuditRunDetail(context.organizationId, auditRunId);
}
