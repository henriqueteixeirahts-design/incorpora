import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

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

export type AuditSummary = {
  createdByName: string | null;
  createdAt: Date;
  updatedByName: string | null;
  updatedAt: Date;
};

/**
 * Busca criador/último editor pra um lote de entidades de uma vez (evita
 * N+1 numa lista paginada) — usado pra exibir "cadastrado por / última
 * alteração por" (R2) em telas que não têm uma tela de detalhe própria
 * (Imobiliárias, Corretores, Fornecedores, Centros de custo), reaproveitando
 * o padrão já usado em getCustomerDetail/getDevelopment.
 */
export async function getAuditSummaries(
  organizationId: string,
  entityType: string,
  entityIds: string[],
  fallback: Map<string, { createdAt: Date; updatedAt: Date }>,
): Promise<Map<string, AuditSummary>> {
  if (entityIds.length === 0) return new Map();

  const events = await prisma.auditEvent.findMany({
    where: { organizationId, entityType, entityId: { in: entityIds } },
    orderBy: { createdAt: "asc" },
    include: { actor: true },
  });

  const byEntity = new Map<string, typeof events>();
  for (const event of events) {
    const list = byEntity.get(event.entityId) ?? [];
    list.push(event);
    byEntity.set(event.entityId, list);
  }

  const result = new Map<string, AuditSummary>();
  for (const id of entityIds) {
    const list = byEntity.get(id) ?? [];
    const created = list[0] ?? null;
    const updated = list[list.length - 1] ?? null;
    const fallbackDates = fallback.get(id);
    result.set(id, {
      createdByName: created?.actor?.fullName ?? null,
      createdAt: created?.createdAt ?? fallbackDates?.createdAt ?? new Date(),
      updatedByName: updated?.actor?.fullName ?? null,
      updatedAt: updated?.createdAt ?? fallbackDates?.updatedAt ?? new Date(),
    });
  }
  return result;
}
