import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import type { AccessContext } from "@/server/auth-context";

export function listSalesTables(developmentId: string) {
  return prisma.salesTable.findMany({
    where: { developmentId },
    include: { _count: { select: { units: true } } },
    orderBy: { startDate: "desc" },
  });
}

export function getSalesTable(organizationId: string, salesTableId: string) {
  return prisma.salesTable.findFirst({
    where: { id: salesTableId, development: { organizationId } },
    include: {
      development: true,
      units: { include: { unit: true }, orderBy: { unit: { number: "asc" } } },
    },
  });
}

export type CreateSalesTableInput = {
  developmentId: string;
  name: string;
  validUntil?: Date;
  downPaymentPercent?: number;
  monthlyInstallments?: number;
  keysInstallmentPercent?: number;
  maxDiscountPercent?: number;
  commissionPercent?: number;
  indexCode?: string;
};

export async function createSalesTable(context: AccessContext, input: CreateSalesTableInput) {
  return prisma.$transaction(async (tx) => {
    const development = await tx.development.findFirst({
      where: { id: input.developmentId, organizationId: context.organizationId },
    });
    if (!development) throw new Error("Empreendimento inválido.");

    const salesTable = await tx.salesTable.create({
      data: {
        developmentId: input.developmentId,
        name: input.name,
        validUntil: input.validUntil,
        downPaymentPercent: input.downPaymentPercent,
        monthlyInstallments: input.monthlyInstallments,
        keysInstallmentPercent: input.keysInstallmentPercent,
        maxDiscountPercent: input.maxDiscountPercent,
        commissionPercent: input.commissionPercent,
        indexCode: input.indexCode,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "SalesTable",
      entityId: salesTable.id,
      afterData: salesTable,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: input.developmentId,
      actorUserId: context.userId,
      eventType: "sales_table.created",
      entityType: "SalesTable",
      entityId: salesTable.id,
      payload: { name: salesTable.name },
    });

    return salesTable;
  });
}

export async function setSalesTableUnitPrice(
  context: AccessContext,
  salesTableId: string,
  unitId: string,
  price: number,
  pricePerSqm?: number,
) {
  return prisma.$transaction(async (tx) => {
    const salesTable = await tx.salesTable.findFirst({
      where: { id: salesTableId, development: { organizationId: context.organizationId } },
    });
    if (!salesTable) throw new Error("Tabela de vendas inválida.");

    const unit = await tx.unit.findFirst({
      where: { id: unitId, developmentId: salesTable.developmentId },
    });
    if (!unit) throw new Error("Unidade não pertence a este empreendimento.");

    const entry = await tx.salesTableUnit.upsert({
      where: { salesTableId_unitId: { salesTableId, unitId } },
      create: { salesTableId, unitId, price, pricePerSqm },
      update: { price, pricePerSqm },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "SalesTableUnit",
      entityId: entry.id,
      afterData: entry,
    });

    return entry;
  });
}
