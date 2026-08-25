import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { canAccessDevelopment } from "@/server/scope";
import { REPORT_GROUPS } from "@/server/reports-center";
import type { AccessContext } from "@/server/auth-context";
import type { ScheduledReportPeriodicity } from "@/generated/prisma/client";

const ENTITY_TYPE = "ScheduledReport";
const VALID_REPORT_KEYS = new Set<string>(REPORT_GROUPS.flatMap((g) => g.reports.map((r): string => r.key)));

/**
 * Escopo por empreendimento (docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 2.5)
 * — `developmentId` é opcional (agendamento "consolidado"), mesma regra já
 * usada em Receivable: sempre visível se sem `developmentId`, ou se o
 * `developmentId` está no escopo do usuário.
 */
export function listScheduledReports(context: AccessContext) {
  return prisma.scheduledReport.findMany({
    where: {
      organizationId: context.organizationId,
      ...(context.developmentAccess === "ALL"
        ? {}
        : { OR: [{ developmentId: null }, { developmentId: { in: [...context.developmentAccess] } }] }),
    },
    orderBy: { createdAt: "desc" },
  });
}

export type CreateScheduledReportInput = {
  name: string;
  reportKey: string;
  developmentId?: string;
  periodicity: ScheduledReportPeriodicity;
  recipients: string[];
};

function validateInput(context: AccessContext, input: CreateScheduledReportInput) {
  if (!VALID_REPORT_KEYS.has(input.reportKey)) throw new Error("Relatório inválido.");
  if (input.developmentId && !canAccessDevelopment(context, input.developmentId)) throw new Error("Empreendimento inválido.");
  for (const email of input.recipients) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`E-mail inválido: ${email}`);
  }
}

export async function createScheduledReport(context: AccessContext, input: CreateScheduledReportInput) {
  validateInput(context, input);

  return prisma.$transaction(async (tx) => {
    const scheduledReport = await tx.scheduledReport.create({
      data: {
        organizationId: context.organizationId,
        name: input.name,
        reportKey: input.reportKey,
        developmentId: input.developmentId,
        periodicity: input.periodicity,
        recipients: input.recipients,
        createdByUserId: context.userId,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: ENTITY_TYPE,
      entityId: scheduledReport.id,
      afterData: scheduledReport,
    });

    return scheduledReport;
  });
}

export async function updateScheduledReport(context: AccessContext, scheduledReportId: string, input: CreateScheduledReportInput & { isActive?: boolean }) {
  validateInput(context, input);

  const before = await prisma.scheduledReport.findFirst({ where: { id: scheduledReportId, organizationId: context.organizationId } });
  if (!before) throw new Error("Agendamento não encontrado.");

  return prisma.$transaction(async (tx) => {
    const scheduledReport = await tx.scheduledReport.update({
      where: { id: scheduledReportId },
      data: {
        name: input.name,
        reportKey: input.reportKey,
        developmentId: input.developmentId ?? null,
        periodicity: input.periodicity,
        recipients: input.recipients,
        isActive: input.isActive ?? before.isActive,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: ENTITY_TYPE,
      entityId: scheduledReport.id,
      beforeData: before,
      afterData: scheduledReport,
    });

    return scheduledReport;
  });
}

export async function deleteScheduledReport(context: AccessContext, scheduledReportId: string) {
  const scheduledReport = await prisma.scheduledReport.findFirst({ where: { id: scheduledReportId, organizationId: context.organizationId } });
  if (!scheduledReport) throw new Error("Agendamento não encontrado.");

  return prisma.$transaction(async (tx) => {
    await tx.scheduledReport.delete({ where: { id: scheduledReportId } });
    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "delete",
      entityType: ENTITY_TYPE,
      entityId: scheduledReportId,
      beforeData: scheduledReport,
    });
  });
}

/**
 * Geração manual ("Gerar agora") — o disparo automático por e-mail é Fase 2
 * (ainda não existe integração de comunicação). Aqui só marca
 * `lastGeneratedAt`; o arquivo em si é baixado pela mesma rota de export
 * genérica da Central de Relatórios (src/app/api/reports/export).
 */
export async function markScheduledReportGenerated(context: AccessContext, scheduledReportId: string) {
  const scheduledReport = await prisma.scheduledReport.findFirst({ where: { id: scheduledReportId, organizationId: context.organizationId } });
  if (!scheduledReport) throw new Error("Agendamento não encontrado.");

  return prisma.scheduledReport.update({ where: { id: scheduledReportId }, data: { lastGeneratedAt: new Date() } });
}
