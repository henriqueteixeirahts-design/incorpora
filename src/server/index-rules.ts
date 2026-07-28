import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { fetchOfficialIndexRate, isOfficialSourceAvailable } from "@/server/index-sources";
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
      create: {
        indexRuleId: input.indexRuleId,
        referenceMonth,
        ratePercent: input.ratePercent,
        source: "MANUAL",
      },
      update: { ratePercent: input.ratePercent, source: "MANUAL" },
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

/**
 * Preenche automaticamente os meses sem valor lançado, buscando a variação
 * oficial no Banco Central (SGS). Nunca sobrescreve um mês que já tem valor
 * — manual ou já buscado antes — só preenche lacunas reais. Só considera
 * meses já fechados (não busca o mês corrente, que ainda não fechou).
 */
async function syncIndexRuleValuesInternal(
  organizationId: string,
  indexRuleId: string,
  actorUserId: string | null,
  monthsBack = 24,
) {
  const rule = await prisma.indexRule.findFirst({
    where: { id: indexRuleId, organizationId },
  });
  if (!rule) throw new Error("Índice inválido.");
  if (!isOfficialSourceAvailable(rule.code)) {
    return { checked: 0, filled: 0 };
  }

  const now = new Date();
  const lastClosedMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const earliestMonth = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);

  const existingValues = await prisma.indexValue.findMany({
    where: { indexRuleId, referenceMonth: { gte: earliestMonth, lte: lastClosedMonth } },
    select: { referenceMonth: true },
  });
  const existingMonths = new Set(
    existingValues.map((v) => v.referenceMonth.toISOString().slice(0, 7)),
  );

  let checked = 0;
  let filled = 0;
  for (
    let month = new Date(earliestMonth);
    month <= lastClosedMonth;
    month = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  ) {
    const key = month.toISOString().slice(0, 7);
    if (existingMonths.has(key)) continue;

    checked += 1;
    const rate = await fetchOfficialIndexRate(rule.code, month);
    if (rate === null) continue;

    await prisma.$transaction(async (tx) => {
      const value = await tx.indexValue.create({
        data: { indexRuleId, referenceMonth: month, ratePercent: rate, source: "OFFICIAL" },
      });
      await recordAuditEvent(tx, {
        organizationId,
        actorUserId,
        action: "create",
        entityType: "IndexValue",
        entityId: value.id,
        afterData: value,
      });
    });
    filled += 1;
  }

  return { checked, filled };
}

/** Sincronização sob demanda, disparada por um usuário pela tela de Índices. */
export function syncIndexRuleValues(context: AccessContext, indexRuleId: string) {
  return syncIndexRuleValuesInternal(context.organizationId, indexRuleId, context.userId);
}

/** Roda a sincronização para todos os índices com fonte oficial de uma organização (uso do job/cron). */
export async function syncIndexRulesForOrganization(organizationId: string) {
  const rules = await prisma.indexRule.findMany({
    where: { organizationId, code: { in: ["INCC", "IPCA", "IGPM"] }, isActive: true },
    select: { id: true, name: true, code: true },
  });

  const results: { indexRuleId: string; name: string; filled: number }[] = [];
  for (const rule of rules) {
    const result = await syncIndexRuleValuesInternal(organizationId, rule.id, null);
    results.push({ indexRuleId: rule.id, name: rule.name, filled: result.filled });
  }

  return results;
}
