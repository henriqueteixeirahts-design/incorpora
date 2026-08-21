import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent, getAuditSummaries } from "@/lib/audit";
import { ValidationError } from "@/lib/errors";
import type { AccessContext } from "@/server/auth-context";
import type { BrokerRole, CustomerType, Prisma } from "@/generated/prisma/client";

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

/**
 * Endereço com logradouro mas sem número é incompleto pra contrato
 * (mesma checagem de src/server/customers.ts, docs/RELATORIO_TESTDRIVE.md
 * achado 4) — reaproveitado aqui pra Imobiliária/Corretor
 * (docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 1/2, mesmo padrão de
 * cadastro de Customer/Permutante).
 */
function assertAddressNumberWhenAddressGiven(input: { street?: string; number?: string }) {
  if (input.street?.trim() && !input.number?.trim()) {
    throw new ValidationError("Informe o número do endereço — endereço sem número fica incompleto para o contrato.");
  }
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

  const audit = await getAuditSummaries(
    organizationId,
    "RealEstateAgency",
    items.map((i) => i.id),
    new Map(items.map((i) => [i.id, { createdAt: i.createdAt, updatedAt: i.updatedAt }])),
  );

  // regionalManagerBrokerId/productManagerBrokerId são colunas soltas (sem FK
  // Prisma, mesmo padrão de CommissionSplit.brokerId) — resolvidas aqui num
  // lote só, pra não fazer N+1 nem depender de include.
  const managerIds = [...new Set(items.flatMap((i) => [i.regionalManagerBrokerId, i.productManagerBrokerId].filter((v): v is string => !!v)))];
  const managers = managerIds.length
    ? await prisma.broker.findMany({ where: { id: { in: managerIds } }, select: { id: true, name: true } })
    : [];
  const managerNameById = new Map(managers.map((m) => [m.id, m.name]));

  return {
    items: items.map((item) => ({
      ...item,
      audit: audit.get(item.id)!,
      regionalManagerName: item.regionalManagerBrokerId ? (managerNameById.get(item.regionalManagerBrokerId) ?? null) : null,
      productManagerName: item.productManagerBrokerId ? (managerNameById.get(item.productManagerBrokerId) ?? null) : null,
    })),
    total,
    page,
    pageSize,
  };
}

export type CreateAgencyInput = {
  name: string;
  document?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  regionalManagerBrokerId?: string;
  productManagerBrokerId?: string;
};

async function assertAgencyDocumentNotDuplicated(organizationId: string, document: string, excludeAgencyId?: string) {
  const existing = await prisma.realEstateAgency.findFirst({
    where: { organizationId, document, ...(excludeAgencyId ? { id: { not: excludeAgencyId } } : {}) },
  });
  if (existing) throw new ValidationError(`Já existe uma imobiliária cadastrada com este documento: ${existing.name}.`);
}

async function assertFixedManagersValid(organizationId: string, input: CreateAgencyInput) {
  const ids = [input.regionalManagerBrokerId, input.productManagerBrokerId].filter((v): v is string => !!v);
  if (ids.length === 0) return;
  const brokers = await prisma.broker.findMany({ where: { id: { in: ids }, organizationId } });
  if (brokers.length !== new Set(ids).size) throw new ValidationError("Gerente regional/de produto inválido.");
  if (brokers.some((b) => b.role !== "MANAGER")) {
    throw new ValidationError("Gerente regional/de produto precisa ser um corretor com papel de Gerente.");
  }
}

export async function createAgency(context: AccessContext, input: CreateAgencyInput) {
  assertAddressNumberWhenAddressGiven(input);
  if (input.document) await assertAgencyDocumentNotDuplicated(context.organizationId, input.document);
  await assertFixedManagersValid(context.organizationId, input);

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
  assertAddressNumberWhenAddressGiven(input);
  if (input.document) await assertAgencyDocumentNotDuplicated(context.organizationId, input.document, agencyId);
  await assertFixedManagersValid(context.organizationId, input);

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

  const [brokers, reservations, proposals, splitTiers] = await Promise.all([
    prisma.broker.count({ where: { agencyId } }),
    prisma.reservation.count({ where: { agencyId } }),
    prisma.proposal.count({ where: { agencyId } }),
    prisma.agencySplitTier.count({ where: { agencyId } }),
  ]);
  const totalLinks = brokers + reservations + proposals + splitTiers;
  if (totalLinks > 0) {
    throw new Error(
      `Não é possível excluir: a imobiliária tem ${totalLinks} registro(s) vinculado(s) (corretores, reservas, propostas ou regra de split).`,
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

/** Corretores com papel de Gerente — pra popular o seletor de "gerente direto" e os fixos de imobiliária. */
export function listManagerBrokers(organizationId: string) {
  return prisma.broker.findMany({
    where: { organizationId, role: "MANAGER" },
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
      include: { agency: true, manager: true },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.broker.count({ where }),
  ]);

  const audit = await getAuditSummaries(
    organizationId,
    "Broker",
    items.map((i) => i.id),
    new Map(items.map((i) => [i.id, { createdAt: i.createdAt, updatedAt: i.updatedAt }])),
  );

  return { items: items.map((item) => ({ ...item, audit: audit.get(item.id)! })), total, page, pageSize };
}

export type CreateBrokerInput = {
  name: string;
  document?: string;
  creci?: string;
  email?: string;
  phone?: string;
  agencyId?: string;
  managerId?: string;
  role?: BrokerRole;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  billingType?: CustomerType;
  billingDocument?: string;
  billingName?: string;
  billingBankName?: string;
  billingBankAgency?: string;
  billingBankAccount?: string;
  billingPixKey?: string;
};

async function assertBrokerDocumentNotDuplicated(organizationId: string, document: string, excludeBrokerId?: string) {
  const existing = await prisma.broker.findFirst({
    where: { organizationId, document, ...(excludeBrokerId ? { id: { not: excludeBrokerId } } : {}) },
  });
  if (existing) throw new ValidationError(`Já existe um corretor cadastrado com este documento: ${existing.name}.`);
}

async function assertManagerValid(organizationId: string, managerId: string, brokerId?: string) {
  if (managerId === brokerId) throw new ValidationError("Um corretor não pode ser gerente de si mesmo.");
  const manager = await prisma.broker.findFirst({ where: { id: managerId, organizationId } });
  if (!manager) throw new ValidationError("Gerente direto inválido.");
  if (manager.role !== "MANAGER") throw new ValidationError("O gerente direto precisa ter papel de Gerente.");
}

export async function createBroker(context: AccessContext, input: CreateBrokerInput) {
  assertAddressNumberWhenAddressGiven(input);
  if (input.document) await assertBrokerDocumentNotDuplicated(context.organizationId, input.document);
  if (input.managerId) await assertManagerValid(context.organizationId, input.managerId);

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
  assertAddressNumberWhenAddressGiven(input);
  if (input.document) await assertBrokerDocumentNotDuplicated(context.organizationId, input.document, brokerId);
  if (input.managerId) await assertManagerValid(context.organizationId, input.managerId, brokerId);

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

  const [reservations, proposals, directReports] = await Promise.all([
    prisma.reservation.count({ where: { brokerId } }),
    prisma.proposal.count({ where: { brokerId } }),
    prisma.broker.count({ where: { managerId: brokerId } }),
  ]);
  const totalLinks = reservations + proposals + directReports;
  if (totalLinks > 0) {
    throw new Error(
      `Não é possível excluir: o corretor tem ${totalLinks} registro(s) vinculado(s) (reservas, propostas ou corretores sob sua gerência).`,
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
