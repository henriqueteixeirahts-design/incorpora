import type { Prisma } from "@/generated/prisma/client";
import type { prisma, TransactionClient } from "@/lib/prisma";

type Db = typeof prisma | TransactionClient;

export type DevelopmentEventInput = {
  organizationId: string;
  developmentId?: string | null;
  actorUserId?: string | null;
  eventType: string; // ex.: "unit.created", "spe.created", "user.invited"
  entityType?: string | null;
  entityId?: string | null;
  payload?: unknown;
  occurredAt?: Date;
};

/**
 * Registra um fato de negócio no evento central do domínio (análogo ao
 * WorkEvent do ObrIA — doc de arquitetura seção 26). Alimenta timeline,
 * notificações e automações futuras. Não substitui AuditEvent: este é o
 * "o que aconteceu", aquele é o "o que mudou no registro".
 */
export async function recordDevelopmentEvent(
  db: Db,
  input: DevelopmentEventInput,
) {
  return db.developmentEvent.create({
    data: {
      organizationId: input.organizationId,
      developmentId: input.developmentId ?? null,
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      payload: input.payload as Prisma.InputJsonValue,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}
