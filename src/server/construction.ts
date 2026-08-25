import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import type { AccessContext } from "@/server/auth-context";
import { canAccessDevelopment } from "@/server/scope";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Fases de obra + evolução física (docs/ESPEC_FASE_C_DASHBOARD_
 * EMPREENDIMENTOS.md, Etapa 2, Aba 3). Fases livres por empreendimento, com
 * peso no total — a % geral de cada medição é ponderada pelo peso das fases
 * ATIVAS naquele momento (Σ peso×%) / Σ peso, o que funciona mesmo que a
 * soma dos pesos não feche em exatamente 100 (nunca bloqueia o lançamento
 * por causa disso — só o resultado fica proporcionalmente ajustado).
 */

async function getDevelopmentOwned(context: AccessContext, developmentId: string) {
  const development = await prisma.development.findFirst({
    where: { id: developmentId, organizationId: context.organizationId },
  });
  if (!development || !canAccessDevelopment(context, developmentId)) {
    throw new Error("Empreendimento não encontrado.");
  }
  return development;
}

export function listConstructionPhases(context: AccessContext, developmentId: string) {
  if (!canAccessDevelopment(context, developmentId)) return Promise.resolve([]);
  return prisma.constructionPhase.findMany({
    where: { developmentId },
    orderBy: { sequence: "asc" },
  });
}

export type CreateConstructionPhaseInput = {
  name: string;
  sequence: number;
  weightPct: number;
  plannedStart?: Date;
  plannedEnd?: Date;
};

export async function createConstructionPhase(
  context: AccessContext,
  developmentId: string,
  input: CreateConstructionPhaseInput,
) {
  await getDevelopmentOwned(context, developmentId);
  if (input.weightPct <= 0 || input.weightPct > 100) throw new Error("Peso da fase deve estar entre 0 e 100.");

  return prisma.$transaction(async (tx) => {
    const phase = await tx.constructionPhase.create({ data: { developmentId, ...input } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "ConstructionPhase",
      entityId: phase.id,
      afterData: phase,
    });
    return phase;
  });
}

export async function updateConstructionPhase(
  context: AccessContext,
  developmentId: string,
  phaseId: string,
  input: CreateConstructionPhaseInput & { isActive?: boolean },
) {
  await getDevelopmentOwned(context, developmentId);
  const before = await prisma.constructionPhase.findFirst({ where: { id: phaseId, developmentId } });
  if (!before) throw new Error("Fase não encontrada.");
  if (input.weightPct <= 0 || input.weightPct > 100) throw new Error("Peso da fase deve estar entre 0 e 100.");

  return prisma.$transaction(async (tx) => {
    const phase = await tx.constructionPhase.update({
      where: { id: phaseId },
      data: { ...input, isActive: input.isActive ?? before.isActive },
    });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "ConstructionPhase",
      entityId: phase.id,
      beforeData: before,
      afterData: phase,
    });
    return phase;
  });
}

/** Desativa a fase (some da % geral, sem apagar histórico de medições já lançadas contra ela). */
export async function deactivateConstructionPhase(context: AccessContext, developmentId: string, phaseId: string) {
  await getDevelopmentOwned(context, developmentId);
  const before = await prisma.constructionPhase.findFirst({ where: { id: phaseId, developmentId } });
  if (!before) throw new Error("Fase não encontrada.");

  return prisma.$transaction(async (tx) => {
    const phase = await tx.constructionPhase.update({ where: { id: phaseId }, data: { isActive: false } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "ConstructionPhase",
      entityId: phase.id,
      beforeData: { isActive: true },
      afterData: { isActive: false },
    });
    return phase;
  });
}

export function listConstructionMeasurements(context: AccessContext, developmentId: string) {
  if (!canAccessDevelopment(context, developmentId)) return Promise.resolve([]);
  return prisma.constructionMeasurement.findMany({
    where: { developmentId },
    include: { phaseValues: { include: { phase: true } } },
    orderBy: { measurementDate: "desc" },
  });
}

export async function getLatestConstructionMeasurement(context: AccessContext, developmentId: string) {
  if (!canAccessDevelopment(context, developmentId)) return null;
  return prisma.constructionMeasurement.findFirst({
    where: { developmentId },
    orderBy: { measurementDate: "desc" },
  });
}

export type CreateConstructionMeasurementInput = {
  measurementDate: Date;
  notes?: string;
  phaseValues: { phaseId: string; percentComplete: number }[];
};

export async function createConstructionMeasurement(
  context: AccessContext,
  developmentId: string,
  input: CreateConstructionMeasurementInput,
) {
  await getDevelopmentOwned(context, developmentId);

  const activePhases = await prisma.constructionPhase.findMany({ where: { developmentId, isActive: true } });
  if (activePhases.length === 0) throw new Error("Cadastre pelo menos uma fase de obra ativa antes de lançar uma medição.");

  for (const value of input.phaseValues) {
    if (value.percentComplete < 0 || value.percentComplete > 100) {
      throw new Error("O % concluído de cada fase deve estar entre 0 e 100.");
    }
  }
  const validPhaseIds = new Set(activePhases.map((p) => p.id));
  for (const value of input.phaseValues) {
    if (!validPhaseIds.has(value.phaseId)) throw new Error("Fase inválida para este empreendimento.");
  }

  const weightSum = activePhases.reduce((sum, p) => sum + Number(p.weightPct), 0);
  const weightedSum = activePhases.reduce((sum, p) => {
    const value = input.phaseValues.find((v) => v.phaseId === p.id);
    return sum + Number(p.weightPct) * (value?.percentComplete ?? 0);
  }, 0);
  const overallPercentComplete = weightSum > 0 ? round2(weightedSum / weightSum) : 0;

  return prisma.$transaction(async (tx) => {
    const measurement = await tx.constructionMeasurement.create({
      data: {
        developmentId,
        measurementDate: input.measurementDate,
        overallPercentComplete,
        notes: input.notes,
        informedByUserId: context.userId,
        phaseValues: {
          create: input.phaseValues.map((v) => ({ phaseId: v.phaseId, percentComplete: v.percentComplete })),
        },
      },
      include: { phaseValues: true },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "ConstructionMeasurement",
      entityId: measurement.id,
      afterData: measurement,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId,
      actorUserId: context.userId,
      eventType: "construction.measurement_recorded",
      entityType: "ConstructionMeasurement",
      entityId: measurement.id,
      payload: { overallPercentComplete },
    });

    return measurement;
  });
}
