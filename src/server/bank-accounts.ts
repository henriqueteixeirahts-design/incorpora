import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { speOwnedScope } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";
import type { Prisma, BankAccountType, BankAccountStatus } from "@/generated/prisma/client";

export type BankAccountSortField = "bankName" | "nickname" | "createdAt";

export function listActiveBankAccounts(organizationId: string) {
  return prisma.bankAccount.findMany({
    where: { organizationId, status: "ACTIVE" },
    orderBy: { bankName: "asc" },
  });
}

export async function listBankAccountsPaged(
  organizationId: string,
  params: {
    search?: string;
    sortBy?: BankAccountSortField;
    sortDir?: "asc" | "desc";
    page?: number;
    pageSize?: number;
  },
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;
  const sortBy = params.sortBy ?? "bankName";
  const sortDir = params.sortDir ?? "asc";
  const search = params.search?.trim();

  const where: Prisma.BankAccountWhereInput = {
    organizationId,
    ...(search
      ? {
          OR: [
            { bankName: { contains: search, mode: "insensitive" } },
            { nickname: { contains: search, mode: "insensitive" } },
            { agency: { contains: search, mode: "insensitive" } },
            { account: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.bankAccount.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.bankAccount.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export type CreateBankAccountInput = {
  bankCode?: string;
  bankName: string;
  agency: string;
  account: string;
  type: BankAccountType;
  pixKeyType?: string;
  pixKeyValue?: string;
  nickname?: string;
  status: BankAccountStatus;
};

export async function createBankAccount(context: AccessContext, input: CreateBankAccountInput) {
  return prisma.$transaction(async (tx) => {
    const bankAccount = await tx.bankAccount.create({
      data: { organizationId: context.organizationId, ...input },
    });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "BankAccount",
      entityId: bankAccount.id,
      afterData: bankAccount,
    });
    return bankAccount;
  });
}

export async function updateBankAccount(
  context: AccessContext,
  bankAccountId: string,
  input: CreateBankAccountInput,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId: context.organizationId },
    });
    if (!before) throw new Error("Conta bancária não encontrada.");

    const bankAccount = await tx.bankAccount.update({ where: { id: bankAccountId }, data: input });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "BankAccount",
      entityId: bankAccount.id,
      beforeData: before,
      afterData: bankAccount,
    });
    return bankAccount;
  });
}

export async function deleteBankAccount(context: AccessContext, bankAccountId: string) {
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, organizationId: context.organizationId },
  });
  if (!bankAccount) throw new Error("Conta bancária não encontrada.");

  const linksCount = await prisma.speBankAccount.count({ where: { bankAccountId } });
  if (linksCount > 0) {
    throw new Error(`Não é possível excluir: a conta está vinculada a ${linksCount} SPE(s).`);
  }

  return prisma.$transaction(async (tx) => {
    await tx.bankAccount.delete({ where: { id: bankAccountId } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: "BankAccount",
      entityId: bankAccountId,
      beforeData: bankAccount,
    });
  });
}

export function listSpeBankAccounts(context: AccessContext, speId: string) {
  return prisma.speBankAccount.findMany({
    where: { speId, ...speOwnedScope(context) },
    include: { bankAccount: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

export async function linkSpeBankAccount(
  context: AccessContext,
  speId: string,
  bankAccountId: string,
  isPrimary: boolean,
) {
  const spe = await prisma.specialPurposeEntity.findFirst({
    where: { id: speId, organizationId: context.organizationId },
  });
  if (!spe) throw new Error("SPE não encontrada.");

  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, organizationId: context.organizationId },
  });
  if (!bankAccount) throw new Error("Conta bancária não encontrada.");

  const existing = await prisma.speBankAccount.findFirst({ where: { speId, bankAccountId } });
  if (existing) throw new Error("Esta conta já está vinculada a esta SPE.");

  return prisma.$transaction(async (tx) => {
    if (isPrimary) {
      await tx.speBankAccount.updateMany({ where: { speId, isPrimary: true }, data: { isPrimary: false } });
    }
    const link = await tx.speBankAccount.create({
      data: { speId, bankAccountId, isPrimary },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "link",
      entityType: "SpecialPurposeEntity",
      entityId: speId,
      afterData: { bankAccountId, isPrimary, bankName: bankAccount.bankName },
    });

    return link;
  });
}

export async function unlinkSpeBankAccount(context: AccessContext, speId: string, bankAccountId: string) {
  const spe = await prisma.specialPurposeEntity.findFirst({
    where: { id: speId, organizationId: context.organizationId },
  });
  if (!spe) throw new Error("SPE não encontrada.");

  const link = await prisma.speBankAccount.findFirst({ where: { speId, bankAccountId } });
  if (!link) throw new Error("Vínculo não encontrado.");

  return prisma.$transaction(async (tx) => {
    await tx.speBankAccount.delete({ where: { id: link.id } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "unlink",
      entityType: "SpecialPurposeEntity",
      entityId: speId,
      beforeData: { bankAccountId },
    });
  });
}

export async function setPrimarySpeBankAccount(context: AccessContext, speId: string, bankAccountId: string) {
  const spe = await prisma.specialPurposeEntity.findFirst({
    where: { id: speId, organizationId: context.organizationId },
  });
  if (!spe) throw new Error("SPE não encontrada.");

  const link = await prisma.speBankAccount.findFirst({ where: { speId, bankAccountId } });
  if (!link) throw new Error("Vínculo não encontrado.");

  return prisma.$transaction(async (tx) => {
    await tx.speBankAccount.updateMany({ where: { speId, isPrimary: true }, data: { isPrimary: false } });
    await tx.speBankAccount.update({ where: { id: link.id }, data: { isPrimary: true } });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "SpecialPurposeEntity",
      entityId: speId,
      afterData: { primaryBankAccountId: bankAccountId },
    });
  });
}
