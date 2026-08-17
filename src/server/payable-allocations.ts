import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { assertDestinationsMatchAmount, type AllocationDestinationInput } from "@/lib/payable-allocation";
import type { AccessContext } from "@/server/auth-context";
import type { Prisma } from "@/generated/prisma/client";

export {
  resolvePayableDestinations,
  computeAllocationAmountsFromPercent,
  type AllocationDestinationInput,
} from "@/lib/payable-allocation";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

async function assertDestinationsOwned(
  tx: Prisma.TransactionClient,
  organizationId: string,
  destinations: { developmentId: string | null }[],
) {
  const developmentIds = destinations.map((d) => d.developmentId).filter((id): id is string => id !== null);
  if (developmentIds.length === 0) return;
  const count = await tx.development.count({ where: { id: { in: developmentIds }, organizationId } });
  if (count !== new Set(developmentIds).size) throw new Error("Empreendimento inválido no rateio.");
}

export async function getPayableAllocations(organizationId: string, payableId: string) {
  const payable = await prisma.payable.findFirst({ where: { id: payableId, organizationId } });
  if (!payable) throw new Error("Conta a pagar não encontrada.");
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
    const payable = await tx.payable.findFirst({ where: { id: payableId, organizationId: context.organizationId } });
    if (!payable) throw new Error("Conta a pagar não encontrada.");
    if (payable.status !== "ENTERED") {
      throw new Error("Só é possível configurar o rateio enquanto a conta está Lançada.");
    }

    if (destinations.length > 0) {
      assertDestinationsMatchAmount(Number(payable.amount), destinations);
      await assertDestinationsOwned(tx, context.organizationId, destinations);
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

export function listAllocationTemplates(organizationId: string) {
  return prisma.allocationTemplate.findMany({
    where: { organizationId },
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
    await assertDestinationsOwned(tx, context.organizationId, input.destinations);

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
  });
  if (!template) throw new Error("Modelo de rateio não encontrado.");

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
