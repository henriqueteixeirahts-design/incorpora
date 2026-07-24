import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import type { AccessContext } from "@/server/auth-context";
import type { IndexCode } from "@/generated/prisma/client";

export function listIndexRules(organizationId: string) {
  return prisma.indexRule.findMany({
    where: { organizationId },
    include: { values: { orderBy: { referenceMonth: "desc" } } },
    orderBy: { name: "asc" },
  });
}

export async function createIndexRule(
  context: AccessContext,
  input: { code: IndexCode; name: string },
) {
  return prisma.$transaction(async (tx) => {
    const rule = await tx.indexRule.create({
      data: { organizationId: context.organizationId, code: input.code, name: input.name },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "IndexRule",
      entityId: rule.id,
      afterData: rule,
    });

    return rule;
  });
}

export async function upsertIndexValue(
  context: AccessContext,
  input: { indexRuleId: string; referenceMonth: Date; ratePercent: number },
) {
  return prisma.$transaction(async (tx) => {
    const rule = await tx.indexRule.findFirst({
      where: { id: input.indexRuleId, organizationId: context.organizationId },
    });
    if (!rule) throw new Error("Índice inválido.");

    const referenceMonth = new Date(
      input.referenceMonth.getFullYear(),
      input.referenceMonth.getMonth(),
      1,
    );

    const value = await tx.indexValue.upsert({
      where: { indexRuleId_referenceMonth: { indexRuleId: input.indexRuleId, referenceMonth } },
      create: { indexRuleId: input.indexRuleId, referenceMonth, ratePercent: input.ratePercent },
      update: { ratePercent: input.ratePercent },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "upsert",
      entityType: "IndexValue",
      entityId: value.id,
      afterData: value,
    });

    return value;
  });
}
