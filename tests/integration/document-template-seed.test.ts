import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { seedDefaultDocumentTemplates } from "@/server/document-template-seed";
import { createDocumentTemplate } from "@/server/document-templates";
import { isDraftTemplateName } from "@/lib/document-template-draft";

/**
 * Biblioteca-padrão de modelos por organização (docs/RELATORIO_TESTDRIVE.md,
 * achado 21) — idempotente, os 3 rascunhos nascem ativos e sinalizados.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Seed de Modelos" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "seed-modelos@teste.local", fullName: "Usuário Seed Modelos" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set() };
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.documentTemplateDevelopment.deleteMany({ where: { documentTemplate: { organizationId: { in: orgIds } } } });
  await prisma.documentTemplate.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("seedDefaultDocumentTemplates", () => {
  it("cria os 3 rascunhos (cessão, distrato, extrato) ativos e sinalizados; pula o contrato sem conteúdo real", async () => {
    const result = await seedDefaultDocumentTemplates(context);

    const created = result.filter((r) => r.created);
    expect(created.map((r) => r.type).sort()).toEqual(["ASSIGNMENT", "RESCISSION", "STATEMENT"]);

    const salesContractResult = result.find((r) => r.type === "SALES_CONTRACT");
    expect(salesContractResult?.created).toBe(false);

    const templates = await prisma.documentTemplate.findMany({ where: { organizationId: org.id } });
    expect(templates).toHaveLength(3);
    for (const template of templates) {
      expect(template.status).toBe("ACTIVE");
      expect(isDraftTemplateName(template.name)).toBe(true);
      expect(template.content).not.toContain("undefined");
    }
  });

  it("é idempotente — rodar de novo não duplica nem sobrescreve o que já existe", async () => {
    const before = await prisma.documentTemplate.count({ where: { organizationId: org.id } });

    const result = await seedDefaultDocumentTemplates(context);
    expect(result.every((r) => !r.created)).toBe(true);

    const after = await prisma.documentTemplate.count({ where: { organizationId: org.id } });
    expect(after).toBe(before);
  });

  it("quando o conteúdo real do contrato é passado, cria o modelo de contrato também", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Org — Seed de Modelos com Contrato" } });
    const otherUser = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "seed-modelos-contrato@teste.local", fullName: "Usuário Seed Contrato" },
    });
    const otherContext: AccessContext = { userId: otherUser.id, organizationId: otherOrg.id, roleNames: [], permissions: new Set() };

    try {
      const result = await seedDefaultDocumentTemplates(otherContext, {
        salesContractContent: "Comprador: {{cliente.nome}}.",
      });
      const salesContractResult = result.find((r) => r.type === "SALES_CONTRACT");
      expect(salesContractResult?.created).toBe(true);
      expect(isDraftTemplateName(salesContractResult!.name)).toBe(false);

      const templates = await prisma.documentTemplate.findMany({ where: { organizationId: otherOrg.id } });
      expect(templates).toHaveLength(4);
    } finally {
      await prisma.documentTemplateDevelopment.deleteMany({ where: { documentTemplate: { organizationId: otherOrg.id } } });
      await prisma.documentTemplate.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.auditEvent.deleteMany({ where: { organizationId: otherOrg.id } });
      await prisma.user.deleteMany({ where: { id: otherUser.id } });
      await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
    }
  });

  it("não sobrescreve um modelo já cadastrado manualmente pra um tipo", async () => {
    const org2 = await prisma.organization.create({ data: { name: "Org — Seed com Modelo Manual" } });
    const user2 = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "seed-manual@teste.local", fullName: "Usuário Seed Manual" },
    });
    const context2: AccessContext = { userId: user2.id, organizationId: org2.id, roleNames: [], permissions: new Set() };

    try {
      const manual = await createDocumentTemplate(context2, {
        name: "Distrato TSH (validado)",
        type: "RESCISSION",
        content: "Distrato manual real.",
        developmentIds: [],
      });

      const result = await seedDefaultDocumentTemplates(context2);
      const rescissionResult = result.find((r) => r.type === "RESCISSION");
      expect(rescissionResult?.created).toBe(false);

      const templates = await prisma.documentTemplate.findMany({ where: { organizationId: org2.id, type: "RESCISSION" } });
      expect(templates).toHaveLength(1);
      expect(templates[0].id).toBe(manual.id);
      expect(templates[0].content).toBe("Distrato manual real.");
    } finally {
      await prisma.documentTemplateDevelopment.deleteMany({ where: { documentTemplate: { organizationId: org2.id } } });
      await prisma.documentTemplate.deleteMany({ where: { organizationId: org2.id } });
      await prisma.auditEvent.deleteMany({ where: { organizationId: org2.id } });
      await prisma.user.deleteMany({ where: { id: user2.id } });
      await prisma.organization.deleteMany({ where: { id: org2.id } });
    }
  });
});
