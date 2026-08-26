import "server-only";

import { prisma, type TransactionClient } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import {
  assertDestinationsMatchAmount,
  developmentIdsWithinAccess,
  type AllocationDestinationInput,
} from "@/lib/payable-allocation";
import type { AccessContext } from "@/server/auth-context";
import { canAccessDevelopment } from "@/server/scope";
import type { Prisma } from "@/generated/prisma/client";

export {
  resolvePayableDestinations,
  computeAllocationAmountsFromPercent,
  type AllocationDestinationInput,
} from "@/lib/payable-allocation";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Checagem pós-fetch pra uma Payable já carregada (com `allocations`) — visível
 * se o `developmentId` direto OU algum destino do rateio está no escopo do
 * usuário (docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 2.5). Sem `developmentId`
 * e sem rateio (conta "da organização") sempre visível.
 */
export function canAccessPayableDevelopments(
  context: AccessContext,
  payable: { developmentId: string | null; allocations: { developmentId: string | null }[] },
) {
  const destinationIds =
    payable.allocations.length > 0 ? payable.allocations.map((a) => a.developmentId) : [payable.developmentId];
  return developmentIdsWithinAccess(destinationIds, context.developmentAccess);
}

/** Mesma ideia, pro `where` de uma listagem de Payable (join com `allocations`). */
export function payableDevelopmentAccessWhere(context: AccessContext): Prisma.PayableWhereInput {
  if (context.developmentAccess === "ALL") return {};
  const ids = [...context.developmentAccess];
  return {
    OR: [
      { developmentId: null, allocations: { none: {} } },
      { developmentId: { in: ids } },
      { allocations: { some: { developmentId: { in: ids } } } },
    ],
  };
}

/** Mesma ideia de `payableDevelopmentAccessWhere`, pro `where` de AllocationTemplate (join com `destinations`). */
function templateDevelopmentAccessWhere(context: AccessContext): Prisma.AllocationTemplateWhereInput {
  if (context.developmentAccess === "ALL") return {};
  const ids = [...context.developmentAccess];
  return {
    OR: [
      { destinations: { none: { developmentId: { not: null } } } },
      { destinations: { some: { developmentId: { in: ids } } } },
    ],
  };
}

async function assertDestinationsOwned(
  tx: TransactionClient,
  context: AccessContext,
  destinations: { developmentId: string | null }[],
) {
  const developmentIds = destinations.map((d) => d.developmentId).filter((id): id is string => id !== null);
  if (developmentIds.length === 0) return;
  const count = await tx.development.count({
    where: { id: { in: developmentIds }, organizationId: context.organizationId },
  });
  if (count !== new Set(developmentIds).size) throw new Error("Empreendimento inválido no rateio.");
  for (const developmentId of developmentIds) {
    if (!canAccessDevelopment(context, developmentId)) throw new Error("Empreendimento inválido no rateio.");
  }
}

export async function getPayableAllocations(context: AccessContext, payableId: string) {
  const payable = await prisma.payable.findFirst({
    where: { id: payableId, organizationId: context.organizationId },
    include: { allocations: true },
  });
  if (!payable || !canAccessPayableDevelopments(context, payable)) throw new Error("Conta a pagar não encontrada.");
  return prisma.payableAllocation.findMany({
    where: { payableId },
    include: { development: true },
    orderBy: { sequence: "asc" },
  });
}

/**
 * Substitui por completo o rateio de uma Payable (mesmo padrão "apaga tudo e
 * recria" já usado nos itens) — a soma dos destinos tem que bater exato com
 * o valor total da conta. Passar array vazio remove o rateio (volta a ser
 * destino único = `Payable.developmentId`).
 */
export async function setPayableAllocations(
  context: AccessContext,
  payableId: string,
  destinations: AllocationDestinationInput[],
) {
  return prisma.$transaction(async (tx) => {
    const payable = await tx.payable.findFirst({
      where: { id: payableId, organizationId: context.organizationId },
      include: { allocations: true },
    });
    if (!payable || !canAccessPayableDevelopments(context, payable)) throw new Error("Conta a pagar não encontrada.");
    if (payable.status !== "ENTERED") {
      throw new Error("Só é possível configurar o rateio enquanto a conta está Lançada.");
    }

    if (destinations.length > 0) {
      assertDestinationsMatchAmount(Number(payable.amount), destinations);
      await assertDestinationsOwned(tx, context, destinations);
    }

    await tx.payableAllocation.deleteMany({ where: { payableId } });
    if (destinations.length > 0) {
      await tx.payableAllocation.createMany({
        data: destinations.map((dest, index) => ({
          payableId,
          developmentId: dest.developmentId,
          percent: dest.percent ?? null,
          amount: dest.amount,
          sequence: index + 1,
        })),
      });
    }

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Payable",
      entityId: payableId,
      beforeData: { allocations: "replaced" },
      afterData: { allocationCount: destinations.length },
    });

    return tx.payableAllocation.findMany({ where: { payableId }, orderBy: { sequence: "asc" } });
  });
}

export function listAllocationTemplates(context: AccessContext) {
  return prisma.allocationTemplate.findMany({
    where: { organizationId: context.organizationId, ...templateDevelopmentAccessWhere(context) },
    include: { destinations: { include: { development: true }, orderBy: { sequence: "asc" } } },
    orderBy: { name: "asc" },
  });
}

export type CreateAllocationTemplateInput = {
  name: string;
  destinations: { developmentId: string | null; percent: number }[];
};

export async function createAllocationTemplate(context: AccessContext, input: CreateAllocationTemplateInput) {
  if (!input.name.trim()) throw new Error("Dê um nome ao modelo de rateio.");
  if (input.destinations.length === 0) throw new Error("Informe ao menos um destino.");
  const percentSum = round2(input.destinations.reduce((acc, d) => acc + d.percent, 0));
  if (percentSum !== 100) throw new Error(`Os percentuais precisam somar 100% (soma atual: ${percentSum}%).`);

  return prisma.$transaction(async (tx) => {
    await assertDestinationsOwned(tx, context, input.destinations);

    const template = await tx.allocationTemplate.create({
      data: {
        organizationId: context.organizationId,
        name: input.name.trim(),
        destinations: {
          create: input.destinations.map((dest, index) => ({
            developmentId: dest.developmentId,
            percent: dest.percent,
            sequence: index + 1,
          })),
        },
      },
      include: { destinations: true },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "AllocationTemplate",
      entityId: template.id,
      afterData: template,
    });

    return template;
  });
}

export async function deleteAllocationTemplate(context: AccessContext, templateId: string) {
  const template = await prisma.allocationTemplate.findFirst({
    where: { id: templateId, organizationId: context.organizationId },
    include: { destinations: true },
  });
  if (!template) throw new Error("Modelo de rateio não encontrado.");
  if (!developmentIdsWithinAccess(template.destinations.map((d) => d.developmentId), context.developmentAccess)) {
    throw new Error("Modelo de rateio não encontrado.");
  }

  await prisma.allocationTemplate.delete({ where: { id: templateId } });
  await recordAuditEvent(prisma, {
    organizationId: context.organizationId,
    actorUserId: context.userId,
    action: "delete",
    entityType: "AllocationTemplate",
    entityId: templateId,
    beforeData: template,
  });
}
