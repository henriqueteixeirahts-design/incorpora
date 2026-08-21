import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { speOwnedScope } from "@/server/scope";
import { uploadEntityDocument, getSignedDocumentUrl, deleteEntityDocumentFile } from "@/server/storage";
import type { AccessContext } from "@/server/auth-context";

const CAPITAL_CALL_ENTITY_TYPE = "SpeCapitalCall";

async function getInvestorScoped(context: AccessContext, investorId: string) {
  const investor = await prisma.speInvestor.findFirst({ where: { id: investorId, ...speOwnedScope(context) } });
  if (!investor) throw new Error("Investidor não encontrado.");
  return investor;
}

/**
 * Status exibível da chamada (docs/ESPEC_APORTES_INVESTIDORES.md, Parte 2.2)
 * — "Vencida" é computado ao vivo, nunca persistido (a chamada pode ficar
 * PLANNED por muito tempo sem ninguém "decidir" que venceu; o prazo é que
 * decide, sempre em cima da data de hoje).
 */
export type CapitalCallDisplayStatus = "EMITTED" | "PARTIALLY_FULFILLED" | "FULFILLED" | "CANCELLED" | "OVERDUE";

export function computeCapitalCallDisplayStatus(
  forecastStatus: "PLANNED" | "PARTIALLY_FULFILLED" | "FULFILLED" | "CANCELLED",
  deadlineDate: Date,
  asOf: Date = new Date(),
): CapitalCallDisplayStatus {
  if (forecastStatus === "FULFILLED" || forecastStatus === "CANCELLED") return forecastStatus;
  if (deadlineDate < asOf) return "OVERDUE";
  return forecastStatus === "PLANNED" ? "EMITTED" : forecastStatus;
}

export async function listCapitalCalls(context: AccessContext, investorId: string) {
  await getInvestorScoped(context, investorId);

  const calls = await prisma.speCapitalCall.findMany({
    where: { forecast: { investorId } },
    include: { forecast: true },
    orderBy: { deadlineDate: "desc" },
  });

  return calls.map((call) => ({
    id: call.id,
    forecastId: call.forecastId,
    amount: Number(call.forecast.amount),
    expectedDate: call.forecast.expectedDate,
    deadlineDate: call.deadlineDate,
    purpose: call.purpose,
    documentPath: call.documentPath,
    displayStatus: computeCapitalCallDisplayStatus(call.forecast.status, call.deadlineDate),
    createdAt: call.createdAt,
  }));
}

/** Chamadas vencidas de toda a organização (painel em destaque — Parte 2.2). */
export async function listOverdueCapitalCalls(context: AccessContext) {
  const calls = await prisma.speCapitalCall.findMany({
    where: {
      deadlineDate: { lt: new Date() },
      forecast: {
        status: { in: ["PLANNED", "PARTIALLY_FULFILLED"] },
        investor: { spe: { organizationId: context.organizationId } },
      },
    },
    include: { forecast: { include: { investor: { include: { spe: true } } } } },
    orderBy: { deadlineDate: "asc" },
  });

  // Chamadas são escopadas por SPE (organização), não por empreendimento —
  // SPE não passa pelo developmentAccess do RBAC (mesmo padrão já usado em
  // spe-contributions.ts, escopo via speOwnedScope/orgScope).
  return calls.map((call) => ({
      id: call.id,
      speId: call.forecast.investor.speId,
      speName: call.forecast.investor.spe.name,
      investorId: call.forecast.investorId,
      investorName: call.forecast.investor.name,
      amount: Number(call.forecast.amount),
      deadlineDate: call.deadlineDate,
    }));
}

export type CreateCapitalCallInput = {
  amount: number;
  expectedDate: Date;
  deadlineDate: Date;
  purpose?: string;
  notes?: string;
};

/** Gera a chamada de capital — cria a previsão (origin=CAPITAL_CALL) e o registro da chamada juntos. */
export async function createCapitalCall(context: AccessContext, investorId: string, input: CreateCapitalCallInput) {
  await getInvestorScoped(context, investorId);

  if (input.deadlineDate < input.expectedDate) {
    throw new Error("O prazo de atendimento não pode ser anterior à data prevista do aporte.");
  }

  return prisma.$transaction(async (tx) => {
    const forecast = await tx.speInvestorContributionForecast.create({
      data: {
        investorId,
        amount: input.amount,
        expectedDate: input.expectedDate,
        origin: "CAPITAL_CALL",
        notes: input.notes,
      },
    });

    const call = await tx.speCapitalCall.create({
      data: { forecastId: forecast.id, deadlineDate: input.deadlineDate, purpose: input.purpose },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: CAPITAL_CALL_ENTITY_TYPE,
      entityId: call.id,
      afterData: { ...call, forecast },
    });

    return call;
  });
}

/** Anexa o documento da chamada (PDF gerado por fora ou digitalizado — motor de templates ainda não cobre SPE/investidor, ver nota na spec 2.2). */
export async function uploadCapitalCallDocument(context: AccessContext, investorId: string, capitalCallId: string, file: File) {
  await getInvestorScoped(context, investorId);
  const call = await prisma.speCapitalCall.findFirst({
    where: { id: capitalCallId, forecast: { investorId } },
  });
  if (!call) throw new Error("Chamada de capital não encontrada.");

  const path = await uploadEntityDocument(file, CAPITAL_CALL_ENTITY_TYPE, capitalCallId);

  if (call.documentPath) await deleteEntityDocumentFile(call.documentPath).catch(() => {});

  return prisma.$transaction(async (tx) => {
    const updated = await tx.speCapitalCall.update({ where: { id: capitalCallId }, data: { documentPath: path } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: CAPITAL_CALL_ENTITY_TYPE,
      entityId: capitalCallId,
      afterData: { documentPath: path },
    });
    return updated;
  });
}

export async function getCapitalCallDocumentUrl(context: AccessContext, investorId: string, capitalCallId: string) {
  await getInvestorScoped(context, investorId);
  const call = await prisma.speCapitalCall.findFirst({ where: { id: capitalCallId, forecast: { investorId } } });
  if (!call || !call.documentPath) return null;
  return getSignedDocumentUrl(call.documentPath);
}
