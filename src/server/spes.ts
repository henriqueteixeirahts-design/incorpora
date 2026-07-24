import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import type { AccessContext } from "@/server/auth-context";

export function listSpes(organizationId: string) {
  return prisma.specialPurposeEntity.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
}

export type CreateSpeInput = {
  name: string;
  document: string;
  address?: string;
};

export async function createSpe(context: AccessContext, input: CreateSpeInput) {
  return prisma.$transaction(async (tx) => {
    const spe = await tx.specialPurposeEntity.create({
      data: {
        organizationId: context.organizationId,
        name: input.name,
        document: input.document,
        address: input.address,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "SpecialPurposeEntity",
      entityId: spe.id,
      afterData: spe,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      eventType: "spe.created",
      entityType: "SpecialPurposeEntity",
      entityId: spe.id,
      payload: { name: spe.name, document: spe.document },
    });

    return spe;
  });
}
