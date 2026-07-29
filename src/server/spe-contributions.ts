import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { speOwnedScope, orgScope } from "@/server/scope";
import { uploadEntityDocument, getSignedDocumentUrl, deleteEntityDocumentFile } from "@/server/storage";
import type { AccessContext } from "@/server/auth-context";
import type { SpeContributionForecastOrigin, Prisma } from "@/generated/prisma/client";

const FORECAST_ENTITY_TYPE = "SpeInvestorContributionForecast";
const CONTRIBUTION_ENTITY_TYPE = "SpeInvestorContribution";

async function getInvestorScoped(context: AccessContext, investorId: string) {
  const investor = await prisma.speInvestor.findFirst({
    where: { id: investorId, ...speOwnedScope(context) },
  });
  if (!investor) throw new Error("Investidor não encontrado.");
  return investor;
}

/** Recalcula o status da previsão a partir da soma dos aportes vinculados. Nunca mexe em CANCELLED. */
async function recomputeForecastStatus(tx: Prisma.TransactionClient, forecastId: string) {
  const forecast = await tx.speInvestorContributionForecast.findUnique({ where: { id: forecastId } });
  if (!forecast || forecast.status === "CANCELLED") return;

  const contributions = await tx.speInvestorContribution.findMany({
    where: { forecastId },
    select: { amount: true },
  });
  const fulfilled = contributions.reduce((sum, c) => sum + Number(c.amount), 0);
  const total = Number(forecast.amount);

  const status = fulfilled <= 0 ? "PLANNED" : fulfilled >= total ? "FULFILLED" : "PARTIALLY_FULFILLED";
  if (status !== forecast.status) {
    await tx.speInvestorContributionForecast.update({ where: { id: forecastId }, data: { status } });
  }
}

export async function getInvestorContributionsDetail(context: AccessContext, investorId: string) {
  const investor = await getInvestorScoped(context, investorId);

  const [forecasts, contributions] = await Promise.all([
    prisma.speInvestorContributionForecast.findMany({
      where: { investorId },
      orderBy: { expectedDate: "asc" },
    }),
    prisma.speInvestorContribution.findMany({
      where: { investorId },
      include: { bankAccount: true },
      orderBy: { creditDate: "desc" },
    }),
  ]);

  const contributionsWithUrl = await Promise.all(
    contributions.map(async (c) => ({
      ...c,
      amount: Number(c.amount),
      receiptSignedUrl: c.receiptFilePath ? await getSignedDocumentUrl(c.receiptFilePath).catch(() => null) : null,
    })),
  );

  const totalRealized = contributions.reduce((sum, c) => sum + Number(c.amount), 0);
  const totalForecast = forecasts
    .filter((f) => f.status !== "CANCELLED")
    .reduce((sum, f) => sum + Number(f.amount), 0);
  const committed = investor.committedCapital === null ? null : Number(investor.committedCapital);

  return {
    forecasts: forecasts.map((f) => ({ ...f, amount: Number(f.amount) })),
    contributions: contributionsWithUrl,
    summary: {
      committed,
      totalForecast,
      totalRealized,
      integralizedPct: committed && committed > 0 ? Math.min(100, (totalRealized / committed) * 100) : null,
    },
  };
}

/** Painel agregado por SPE — soma de todos os investidores. */
export async function getSpeContributionSummary(context: AccessContext, speId: string) {
  const spe = await prisma.specialPurposeEntity.findFirst({ where: { id: speId, ...orgScope(context) } });
  if (!spe) throw new Error("SPE não encontrada.");

  const investors = await prisma.speInvestor.findMany({
    where: { speId },
    select: {
      committedCapital: true,
      contributionForecasts: { where: { status: { not: "CANCELLED" } }, select: { amount: true } },
      contributions: { select: { amount: true } },
    },
  });

  let committed = 0;
  let hasOpenCommitment = false;
  let totalForecast = 0;
  let totalRealized = 0;

  for (const investor of investors) {
    if (investor.committedCapital === null) hasOpenCommitment = true;
    else committed += Number(investor.committedCapital);
    totalForecast += investor.contributionForecasts.reduce((sum, f) => sum + Number(f.amount), 0);
    totalRealized += investor.contributions.reduce((sum, c) => sum + Number(c.amount), 0);
  }

  return {
    committed,
    hasOpenCommitment,
    totalForecast,
    totalRealized,
    integralizedPct: committed > 0 ? Math.min(100, (totalRealized / committed) * 100) : null,
  };
}

export type CreateContributionForecastInput = {
  amount: number;
  expectedDate: Date;
  origin: SpeContributionForecastOrigin;
  notes?: string;
};

export async function createContributionForecast(
  context: AccessContext,
  investorId: string,
  input: CreateContributionForecastInput,
) {
  await getInvestorScoped(context, investorId);

  return prisma.$transaction(async (tx) => {
    const forecast = await tx.speInvestorContributionForecast.create({
      data: { investorId, ...input },
    });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: FORECAST_ENTITY_TYPE,
      entityId: forecast.id,
      afterData: forecast,
    });
    return forecast;
  });
}

export async function updateContributionForecast(
  context: AccessContext,
  investorId: string,
  forecastId: string,
  input: CreateContributionForecastInput,
) {
  await getInvestorScoped(context, investorId);
  const before = await prisma.speInvestorContributionForecast.findFirst({ where: { id: forecastId, investorId } });
  if (!before) throw new Error("Previsão não encontrada.");
  if (before.status === "CANCELLED") throw new Error("Previsão cancelada não pode ser editada.");

  return prisma.$transaction(async (tx) => {
    const forecast = await tx.speInvestorContributionForecast.update({ where: { id: forecastId }, data: input });
    await recomputeForecastStatus(tx, forecastId);
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: FORECAST_ENTITY_TYPE,
      entityId: forecast.id,
      beforeData: before,
      afterData: forecast,
    });
    return forecast;
  });
}

export async function cancelContributionForecast(
  context: AccessContext,
  investorId: string,
  forecastId: string,
  reason: string,
) {
  await getInvestorScoped(context, investorId);
  const before = await prisma.speInvestorContributionForecast.findFirst({ where: { id: forecastId, investorId } });
  if (!before) throw new Error("Previsão não encontrada.");
  if (before.status === "FULFILLED") throw new Error("Previsão já totalmente baixada não pode ser cancelada.");

  return prisma.$transaction(async (tx) => {
    const forecast = await tx.speInvestorContributionForecast.update({
      where: { id: forecastId },
      data: { status: "CANCELLED", cancelReason: reason },
    });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: FORECAST_ENTITY_TYPE,
      entityId: forecast.id,
      beforeData: before,
      afterData: forecast,
    });
    return forecast;
  });
}

export type CreateContributionInput = {
  forecastId?: string;
  amount: number;
  creditDate: Date;
  bankAccountId: string;
  method?: string;
  notes?: string;
  receiptFile?: File;
};

async function assertForecastBelongsToInvestor(investorId: string, forecastId?: string) {
  if (!forecastId) return;
  const forecast = await prisma.speInvestorContributionForecast.findFirst({ where: { id: forecastId, investorId } });
  if (!forecast) throw new Error("Previsão inválida para este investidor.");
  if (forecast.status === "CANCELLED") throw new Error("Não é possível vincular a uma previsão cancelada.");
}

export async function createContribution(
  context: AccessContext,
  investorId: string,
  input: CreateContributionInput,
) {
  await getInvestorScoped(context, investorId);
  await assertForecastBelongsToInvestor(investorId, input.forecastId);

  const { receiptFile, ...data } = input;

  return prisma.$transaction(async (tx) => {
    const contribution = await tx.speInvestorContribution.create({
      data: { investorId, ...data },
    });

    let receiptFilePath: string | null = null;
    if (receiptFile) {
      receiptFilePath = await uploadEntityDocument(receiptFile, CONTRIBUTION_ENTITY_TYPE, contribution.id);
      await tx.speInvestorContribution.update({ where: { id: contribution.id }, data: { receiptFilePath } });
    }

    if (input.forecastId) await recomputeForecastStatus(tx, input.forecastId);

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: CONTRIBUTION_ENTITY_TYPE,
      entityId: contribution.id,
      afterData: { ...contribution, receiptFilePath },
    });
    return contribution;
  });
}

export async function deleteContribution(context: AccessContext, investorId: string, contributionId: string) {
  await getInvestorScoped(context, investorId);
  const before = await prisma.speInvestorContribution.findFirst({ where: { id: contributionId, investorId } });
  if (!before) throw new Error("Aporte não encontrado.");

  await prisma.$transaction(async (tx) => {
    await tx.speInvestorContribution.delete({ where: { id: contributionId } });
    if (before.forecastId) await recomputeForecastStatus(tx, before.forecastId);
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: CONTRIBUTION_ENTITY_TYPE,
      entityId: contributionId,
      beforeData: before,
    });
  });

  if (before.receiptFilePath) await deleteEntityDocumentFile(before.receiptFilePath).catch(() => {});
}
