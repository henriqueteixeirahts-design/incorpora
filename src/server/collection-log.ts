import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import type { AccessContext } from "@/server/auth-context";

export type LogCollectionContactInput = {
  occurredAt: Date;
  channel: string;
  summary: string;
  nextStepNote?: string;
};

/** Registro manual de um contato de cobrança (Fase B, Parte 3.2) — "data, canal, resumo, próximo passo". */
export async function logCollectionContact(context: AccessContext, customerId: string, input: LogCollectionContactInput) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: customerId, organizationId: context.organizationId } });
    if (!customer) throw new Error("Cliente inválido.");

    const log = await tx.collectionContactLog.create({
      data: {
        organizationId: context.organizationId,
        customerId,
        occurredAt: input.occurredAt,
        channel: input.channel,
        summary: input.summary,
        nextStepNote: input.nextStepNote,
        createdByUserId: context.userId,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "CollectionContactLog",
      entityId: log.id,
      afterData: log,
    });

    return log;
  });
}

export function listCollectionHistory(organizationId: string, customerId: string) {
  return prisma.collectionContactLog.findMany({
    where: { organizationId, customerId },
    orderBy: { occurredAt: "desc" },
  });
}
