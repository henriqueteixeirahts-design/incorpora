import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { speOwnedScope } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";
import type {
  SpeDocumentHolderType,
  SpePartnerRole,
  SpeInvestorModality,
  SpeInvestorLoanInterestPeriod,
} from "@/generated/prisma/client";

export function listSpePartners(context: AccessContext, speId: string) {
  return prisma.spePartner.findMany({
    where: { speId, ...speOwnedScope(context) },
    orderBy: [{ endDate: "asc" }, { createdAt: "asc" }],
  });
}

/** Soma de participação dos sócios ATIVOS (sem data de saída) — usada pro alerta de 100%, nunca bloqueio. */
export async function getActivePartnersParticipationTotal(context: AccessContext, speId: string) {
  const active = await prisma.spePartner.findMany({
    where: { speId, endDate: null, ...speOwnedScope(context) },
    select: { participationPct: true },
  });
  return active.reduce((sum, p) => sum + Number(p.participationPct), 0);
}

export type CreateSpePartnerInput = {
  type: SpeDocumentHolderType;
  name: string;
  document: string;
  participationPct: number;
  role?: SpePartnerRole;
  startDate?: Date;
  endDate?: Date;
};

export async function createSpePartner(context: AccessContext, speId: string, input: CreateSpePartnerInput) {
  const spe = await prisma.specialPurposeEntity.findFirst({
    where: { id: speId, organizationId: context.organizationId },
  });
  if (!spe) throw new Error("SPE não encontrada.");

  return prisma.$transaction(async (tx) => {
    const partner = await tx.spePartner.create({ data: { speId, ...input } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "SpePartner",
      entityId: partner.id,
      afterData: partner,
    });
    return partner;
  });
}

export async function updateSpePartner(
  context: AccessContext,
  speId: string,
  partnerId: string,
  input: CreateSpePartnerInput,
) {
  const before = await prisma.spePartner.findFirst({ where: { id: partnerId, speId, ...speOwnedScope(context) } });
  if (!before) throw new Error("Sócio não encontrado.");

  return prisma.$transaction(async (tx) => {
    const partner = await tx.spePartner.update({ where: { id: partnerId }, data: input });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "SpePartner",
      entityId: partner.id,
      beforeData: before,
      afterData: partner,
    });
    return partner;
  });
}

export async function deleteSpePartner(context: AccessContext, speId: string, partnerId: string) {
  const partner = await prisma.spePartner.findFirst({ where: { id: partnerId, speId, ...speOwnedScope(context) } });
  if (!partner) throw new Error("Sócio não encontrado.");

  return prisma.$transaction(async (tx) => {
    await tx.spePartner.delete({ where: { id: partnerId } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: "SpePartner",
      entityId: partnerId,
      beforeData: partner,
    });
  });
}

export function listSpeInvestors(context: AccessContext, speId: string) {
  return prisma.speInvestor.findMany({ where: { speId, ...speOwnedScope(context) }, orderBy: { createdAt: "asc" } });
}

export type CreateSpeInvestorInput = {
  type: SpeDocumentHolderType;
  name: string;
  document: string;
  email: string;
  phone: string;
  modality: SpeInvestorModality;
  contributedCapital?: number;
  resultParticipationPct?: number;
  contributionDate?: Date;
  notes?: string;
  committedCapital?: number;
  returnBankName?: string;
  returnBankAgency?: string;
  returnBankAccount?: string;
  returnPixKeyType?: string;
  returnPixKeyValue?: string;
  loanInterestRate?: number;
  loanInterestPeriod?: SpeInvestorLoanInterestPeriod;
  loanIndexRuleId?: string;
  loanGraceMonths?: number;
  loanTermMonths?: number;
};

export async function createSpeInvestor(context: AccessContext, speId: string, input: CreateSpeInvestorInput) {
  const spe = await prisma.specialPurposeEntity.findFirst({
    where: { id: speId, organizationId: context.organizationId },
  });
  if (!spe) throw new Error("SPE não encontrada.");

  return prisma.$transaction(async (tx) => {
    const investor = await tx.speInvestor.create({ data: { speId, ...input } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "SpeInvestor",
      entityId: investor.id,
      afterData: investor,
    });
    return investor;
  });
}

export async function updateSpeInvestor(
  context: AccessContext,
  speId: string,
  investorId: string,
  input: CreateSpeInvestorInput,
) {
  const before = await prisma.speInvestor.findFirst({ where: { id: investorId, speId, ...speOwnedScope(context) } });
  if (!before) throw new Error("Investidor não encontrado.");

  return prisma.$transaction(async (tx) => {
    const investor = await tx.speInvestor.update({ where: { id: investorId }, data: input });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "SpeInvestor",
      entityId: investor.id,
      beforeData: before,
      afterData: investor,
    });
    return investor;
  });
}

export async function deleteSpeInvestor(context: AccessContext, speId: string, investorId: string) {
  const investor = await prisma.speInvestor.findFirst({ where: { id: investorId, speId, ...speOwnedScope(context) } });
  if (!investor) throw new Error("Investidor não encontrado.");

  return prisma.$transaction(async (tx) => {
    await tx.speInvestor.delete({ where: { id: investorId } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: "SpeInvestor",
      entityId: investorId,
      beforeData: investor,
    });
  });
}
