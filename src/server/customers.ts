import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import {
  uploadEntityDocument,
  getSignedDocumentUrl,
  deleteEntityDocumentFile,
} from "@/server/storage";
import { ValidationError } from "@/lib/errors";
import type { AccessContext } from "@/server/auth-context";
import type { CustomerType, DocumentCategory, Prisma } from "@/generated/prisma/client";

const ENTITY_TYPE = "Customer";

export type CustomerSortField = "name" | "type" | "document" | "createdAt";

export type ListCustomersParams = {
  search?: string;
  sortBy?: CustomerSortField;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

/** Lista simples pra selects (ex.: pagador de recebível avulso) — sem paginação, mesmo padrão de `listSuppliers`. */
export function listCustomers(organizationId: string) {
  return prisma.customer.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function listCustomersPaged(organizationId: string, params: ListCustomersParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "name";
  const sortDir = params.sortDir ?? "asc";
  const search = params.search?.trim();

  const where: Prisma.CustomerWhereInput = {
    organizationId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { document: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getCustomerDetail(organizationId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    include: { contacts: { orderBy: { createdAt: "asc" } } },
  });
  if (!customer) return null;

  const documents = await prisma.document.findMany({
    where: { organizationId, entityType: ENTITY_TYPE, entityId: customerId },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: true },
  });
  const documentsWithUrl = await Promise.all(
    documents.map(async (doc) => ({
      ...doc,
      uploadedByName: doc.uploadedBy?.fullName ?? null,
      signedUrl: await getSignedDocumentUrl(doc.fileUrl).catch(() => null),
    })),
  );

  const auditTrail = await prisma.auditEvent.findMany({
    where: { organizationId, entityType: ENTITY_TYPE, entityId: customerId },
    orderBy: { createdAt: "asc" },
    include: { actor: true },
  });
  const createdEvent = auditTrail[0] ?? null;
  const updatedEvent = auditTrail[auditTrail.length - 1] ?? null;

  return {
    ...customer,
    documents: documentsWithUrl,
    audit: {
      createdByName: createdEvent?.actor?.fullName ?? null,
      createdAt: createdEvent?.createdAt ?? customer.createdAt,
      updatedByName: updatedEvent?.actor?.fullName ?? null,
      updatedAt: updatedEvent?.createdAt ?? customer.updatedAt,
    },
  };
}

export type CreateCustomerInput = {
  type: CustomerType;
  name: string;
  document: string;
  email?: string;
  phone?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  maritalStatus?: string;
  nationality?: string;
  profession?: string;
  notes?: string;
};

export class DuplicateDocumentError extends Error {
  constructor(
    public customerId: string,
    public customerName: string,
  ) {
    super(`Já existe um cliente cadastrado com este documento: ${customerName}.`);
  }
}

async function assertDocumentNotDuplicated(
  organizationId: string,
  document: string,
  excludeCustomerId?: string,
) {
  const existing = await prisma.customer.findFirst({
    where: { organizationId, document, ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}) },
  });
  if (existing) throw new DuplicateDocumentError(existing.id, existing.name);
}

/**
 * Endereço com logradouro mas sem número é incompleto pra contrato
 * (docs/RELATORIO_TESTDRIVE.md, achado 4) — só cobra o número quando um
 * endereço de fato está sendo informado, não quando o cliente não tem
 * endereço cadastrado ainda.
 */
function assertAddressNumberWhenAddressGiven(input: { street?: string; number?: string }) {
  if (input.street?.trim() && !input.number?.trim()) {
    throw new ValidationError("Informe o número do endereço — endereço sem número fica incompleto para o contrato.");
  }
}

export async function createCustomer(context: AccessContext, input: CreateCustomerInput) {
  assertAddressNumberWhenAddressGiven(input);
  await assertDocumentNotDuplicated(context.organizationId, input.document);

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

export async function updateCustomer(
  context: AccessContext,
  customerId: string,
  input: CreateCustomerInput,
) {
  assertAddressNumberWhenAddressGiven(input);

  const before = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: context.organizationId },
  });
  if (!before) throw new ValidationError("Cliente não encontrado.");

  await assertDocumentNotDuplicated(context.organizationId, input.document, customerId);

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.update({
      where: { id: customerId },
      data: input,
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Customer",
      entityId: customer.id,
      beforeData: before,
      afterData: customer,
    });
    return customer;
  });
}

export async function deleteCustomer(context: AccessContext, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: context.organizationId },
  });
  if (!customer) throw new Error("Cliente não encontrado.");

  const [reservations, proposals, sales, contracts, assignments] = await Promise.all([
    prisma.reservation.count({ where: { customerId } }),
    prisma.proposal.count({ where: { customerId } }),
    prisma.sale.count({ where: { customerId } }),
    prisma.contract.count({ where: { customerId } }),
    prisma.contractAssignment.count({
      where: { OR: [{ previousCustomerId: customerId }, { newCustomerId: customerId }] },
    }),
  ]);
  const totalLinks = reservations + proposals + sales + contracts + assignments;
  if (totalLinks > 0) {
    throw new Error(
      `Não é possível excluir: o cliente tem ${totalLinks} registro(s) vinculado(s) ` +
        `(reservas, propostas, vendas, contratos ou cessões de direitos).`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const documents = await tx.document.findMany({
      where: { organizationId: context.organizationId, entityType: ENTITY_TYPE, entityId: customerId },
    });
    await tx.document.deleteMany({
      where: { organizationId: context.organizationId, entityType: ENTITY_TYPE, entityId: customerId },
    });
    await tx.customer.delete({ where: { id: customerId } });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: "Customer",
      entityId: customerId,
      beforeData: customer,
    });

    // Remove os arquivos do Storage fora da transação de banco não é possível
    // aqui (função síncrona com tx); a limpeza dos objetos é feita após o
    // commit, no chamador — ver deleteCustomerAction.
    return { customer, documentPaths: documents.map((d) => d.fileUrl) };
  });
}

export type CustomerContactInput = {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
};

export async function createCustomerContact(
  context: AccessContext,
  customerId: string,
  input: CustomerContactInput,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: context.organizationId },
  });
  if (!customer) throw new Error("Cliente não encontrado.");

  return prisma.customerContact.create({ data: { customerId, ...input } });
}

export async function deleteCustomerContact(context: AccessContext, contactId: string) {
  const contact = await prisma.customerContact.findFirst({
    where: { id: contactId, customer: { organizationId: context.organizationId } },
  });
  if (!contact) throw new Error("Contato não encontrado.");

  await prisma.customerContact.delete({ where: { id: contactId } });
}

export async function uploadCustomerDocument(
  context: AccessContext,
  customerId: string,
  file: File,
  category: DocumentCategory,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: context.organizationId },
  });
  if (!customer) throw new Error("Cliente não encontrado.");

  const path = await uploadEntityDocument(file, ENTITY_TYPE, customerId);

  return prisma.document.create({
    data: {
      organizationId: context.organizationId,
      entityType: ENTITY_TYPE,
      entityId: customerId,
      category,
      fileName: file.name,
      fileUrl: path,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedById: context.userId,
    },
  });
}

export async function deleteCustomerDocument(context: AccessContext, documentId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId: context.organizationId, entityType: ENTITY_TYPE },
  });
  if (!document) throw new Error("Anexo não encontrado.");

  await prisma.document.delete({ where: { id: documentId } });
  await deleteEntityDocumentFile(document.fileUrl);
}
