import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import type { AccessContext } from "@/server/auth-context";
import type { CustomerType } from "@/generated/prisma/client";

export function listCustomers(organizationId: string) {
  return prisma.customer.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function createCustomer(
  context: AccessContext,
  input: { type: CustomerType; name: string; document: string; email?: string; phone?: string },
) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: { organizationId: context.organizationId, ...input },
    });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "Customer",
      entityId: customer.id,
      afterData: customer,
    });
    return customer;
  });
}

export function listAgencies(organizationId: string) {
  return prisma.realEstateAgency.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
}

export async function createAgency(
  context: AccessContext,
  input: { name: string; document?: string },
) {
  return prisma.$transaction(async (tx) => {
    const agency = await tx.realEstateAgency.create({
      data: { organizationId: context.organizationId, ...input },
    });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "RealEstateAgency",
      entityId: agency.id,
      afterData: agency,
    });
    return agency;
  });
}

export function listBrokers(organizationId: string) {
  return prisma.broker.findMany({
    where: { organizationId },
    include: { agency: true },
    orderBy: { name: "asc" },
  });
}

export async function createBroker(
  context: AccessContext,
  input: { name: string; document?: string; email?: string; phone?: string; agencyId?: string },
) {
  return prisma.$transaction(async (tx) => {
    const broker = await tx.broker.create({
      data: { organizationId: context.organizationId, ...input },
    });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "Broker",
      entityId: broker.id,
      afterData: broker,
    });
    return broker;
  });
}
