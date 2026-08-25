import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import {
  createScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  markScheduledReportGenerated,
  listScheduledReports,
} from "@/server/scheduled-reports";

/**
 * docs/ESPEC_FASE_C_DASHBOARD_EMPREENDIMENTOS.md, Etapa 6 — estrutura de
 * relatórios agendados (preparação Fase 2, geração manual por ora).
 */

let org: { id: string };
let otherOrg: { id: string };
let user: { id: string };
let context: AccessContext;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Relatórios Agendados" } });
  otherOrg = await prisma.organization.create({ data: { name: "Org — Relatórios Agendados (outra)" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "relatorios-agendados@teste.local", fullName: "Usuário Relatórios Agendados" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };
});

afterAll(async () => {
  const orgIds = [org.id, otherOrg.id];
  await prisma.scheduledReport.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("scheduled reports", () => {
  it("rejeita relatório inválido e e-mail inválido", async () => {
    await expect(
      createScheduledReport(context, { name: "X", reportKey: "not-a-real-report", periodicity: "MONTHLY", recipients: [] }),
    ).rejects.toThrow("Relatório inválido.");

    await expect(
      createScheduledReport(context, { name: "X", reportKey: "sales-period", periodicity: "MONTHLY", recipients: ["not-an-email"] }),
    ).rejects.toThrow(/E-mail inválido/);
  });

  it("cria, atualiza, marca geração e exclui", async () => {
    const created = await createScheduledReport(context, {
      name: "Vendas mensais", reportKey: "sales-period", periodicity: "MONTHLY", recipients: ["financeiro@tsh.com.br"],
    });
    expect(created.isActive).toBe(true);
    expect(created.lastGeneratedAt).toBeNull();

    const generated = await markScheduledReportGenerated(context, created.id);
    expect(generated.lastGeneratedAt).not.toBeNull();

    const updated = await updateScheduledReport(context, created.id, {
      name: "Vendas mensais (atualizado)", reportKey: "sales-period", periodicity: "QUARTERLY", recipients: [], isActive: false,
    });
    expect(updated.name).toBe("Vendas mensais (atualizado)");
    expect(updated.periodicity).toBe("QUARTERLY");
    expect(updated.isActive).toBe(false);

    await deleteScheduledReport(context, created.id);
    const list = await listScheduledReports(context);
    expect(list.find((r) => r.id === created.id)).toBeUndefined();
  });

  it("isolamento por organização", async () => {
    const created = await createScheduledReport(context, {
      name: "Isolamento", reportKey: "sales-period", periodicity: "WEEKLY", recipients: [],
    });
    const otherContext: AccessContext = { ...context, organizationId: otherOrg.id };

    const otherList = await listScheduledReports(otherContext);
    expect(otherList.find((r) => r.id === created.id)).toBeUndefined();

    await expect(deleteScheduledReport(otherContext, created.id)).rejects.toThrow("Agendamento não encontrado.");
  });
});
