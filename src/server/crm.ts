import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import type { AccessContext } from "@/server/auth-context";
import type { CustomerType, Prisma } from "@/generated/prisma/client";

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

export type AgencySortField = "name" | "createdAt";

export function listAgencies(organizationId: string) {
  return prisma.realEstateAgency.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
}

export async function listAgenciesPaged(
  organizationId: string,
  params: { search?: string; sortBy?: AgencySortField; sortDir?: "asc" | "desc"; page?: number; pageSize?: number },
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "name";
  const sortDir = params.sortDir ?? "asc";
  const search = params.search?.trim();

  const where: Prisma.RealEstateAgencyWhereInput = {
    organizationId,
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.realEstateAgency.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.realEstateAgency.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export type CreateAgencyInput = { name: string; document?: string };

export async function createAgency(context: AccessContext, input: CreateAgencyInput) {
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

export async function updateAgency(
  context: AccessContext,
  agencyId: string,
  input: CreateAgencyInput,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.realEstateAgency.findFirst({
      where: { id: agencyId, organizationId: context.organizationId },
    });
    if (!before) throw new Error("Imobiliária não encontrada.");

    const agency = await tx.realEstateAgency.update({ where: { id: agencyId }, data: input });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "RealEstateAgency",
      entityId: agency.id,
      beforeData: before,
      afterData: agency,
    });
    return agency;
  });
}

export async function deleteAgency(context: AccessContext, agencyId: string) {
  const agency = await prisma.realEstateAgency.findFirst({
    where: { id: agencyId, organizationId: context.organizationId },
  });
  if (!agency) throw new Error("Imobiliária não encontrada.");

  const [brokers, reservations, proposals] = await Promise.all([
    prisma.broker.count({ where: { agencyId } }),
    prisma.reservation.count({ where: { agencyId } }),
    prisma.proposal.count({ where: { agencyId } }),
  ]);
  const totalLinks = brokers + reservations + proposals;
  if (totalLinks > 0) {
    throw new Error(
      `Não é possível excluir: a imobiliária tem ${totalLinks} registro(s) vinculado(s) (corretores, reservas ou propostas).`,
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.realEstateAgency.delete({ where: { id: agencyId } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: "RealEstateAgency",
      entityId: agencyId,
      beforeData: agency,
    });
  });
}

export type BrokerSortField = "name" | "createdAt";

export function listBrokers(organizationId: string) {
  return prisma.broker.findMany({
    where: { organizationId },
    include: { agency: true },
    orderBy: { name: "asc" },
  });
}

export async function listBrokersPaged(
  organizationId: string,
  params: { search?: string; sortBy?: BrokerSortField; sortDir?: "asc" | "desc"; page?: number; pageSize?: number },
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "name";
  const sortDir = params.sortDir ?? "asc";
  const search = params.search?.trim();

  const where: Prisma.BrokerWhereInput = {
    organizationId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.broker.findMany({
      where,
      include: { agency: true },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.broker.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export type CreateBrokerInput = {
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  agencyId?: string;
};

export async function createBroker(context: AccessContext, input: CreateBrokerInput) {
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

export async function updateBroker(
  context: AccessContext,
  brokerId: string,
  input: CreateBrokerInput,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.broker.findFirst({
      where: { id: brokerId, organizationId: context.organizationId },
    });
    if (!before) throw new Error("Corretor não encontrado.");

    const broker = await tx.broker.update({ where: { id: brokerId }, data: input });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Broker",
      entityId: broker.id,
      beforeData: before,
      afterData: broker,
    });
    return broker;
  });
}

export async function deleteBroker(context: AccessContext, brokerId: string) {
  const broker = await prisma.broker.findFirst({
    where: { id: brokerId, organizationId: context.organizationId },
  });
  if (!broker) throw new Error("Corretor não encontrado.");

  const [reservations, proposals] = await Promise.all([
    prisma.reservation.count({ where: { brokerId } }),
    prisma.proposal.count({ where: { brokerId } }),
  ]);
  const totalLinks = reservations + proposals;
  if (totalLinks > 0) {
    throw new Error(
      `Não é possível excluir: o corretor tem ${totalLinks} registro(s) vinculado(s) (reservas ou propostas).`,
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.broker.delete({ where: { id: brokerId } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: "Broker",
      entityId: brokerId,
      beforeData: broker,
    });
  });
}
