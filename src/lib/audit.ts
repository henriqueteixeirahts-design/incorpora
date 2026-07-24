import { Prisma, type PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type AuditEventInput = {
  organizationId: string;
  actorUserId?: string | null;
  action: "create" | "update" | "delete" | "approve" | "cancel" | string;
  entityType: string;
  entityId: string;
  beforeData?: unknown;
  afterData?: unknown;
  ipAddress?: string | null;
};

/**
 * Registra uma entrada na trilha de auditoria genérica. Toda mutação de
 * dados relevante deve chamar isto — PRD: "Todas as ações críticas devem
 * possuir trilha de auditoria."
 */
export async function recordAuditEvent(db: Db, input: AuditEventInput) {
  return db.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeData: input.beforeData as Prisma.InputJsonValue,
      afterData: input.afterData as Prisma.InputJsonValue,
      ipAddress: input.ipAddress ?? null,
    },
  });
}
