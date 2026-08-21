import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createAgency, updateAgency, listAgenciesPaged } from "@/server/crm";
import { createSupplier, listSuppliersPaged } from "@/server/finance-setup";

/**
 * Sprint V3 (R2 — auditoria universal) — Imobiliárias/Corretores e
 * Fornecedores/Centros de custo não tinham tela de detalhe própria como
 * getCustomerDetail, então o "cadastrado por / última alteração por" foi
 * anexado direto nas listagens paginadas via getAuditSummaries (src/lib/audit.ts).
 * Regressão: garante que a listagem paginada retorna nome de quem criou e
 * de quem fez a última alteração, refletindo a ordem real dos AuditEvents.
 */

let org: { id: string };
let userA: { id: string };
let userB: { id: string };
let contextA: AccessContext;
let contextB: AccessContext;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Auditoria em Listagens" } });
  userA = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "auditoria-a@teste.local", fullName: "Usuária A" },
  });
  userB = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "auditoria-b@teste.local", fullName: "Usuário B" },
  });
  contextA = { userId: userA.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };
  contextB = { userId: userB.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { organizationId: org.id } });
  await prisma.realEstateAgency.deleteMany({ where: { organizationId: org.id } });
  await prisma.supplier.deleteMany({ where: { organizationId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
});

describe("listAgenciesPaged — audit summary", () => {
  it("reporta quem criou e quem fez a última alteração", async () => {
    const agency = await createAgency(contextA, { name: "Imobiliária Auditada" });
    await updateAgency(contextB, agency.id, { name: "Imobiliária Auditada (renomeada)" });

    const { items } = await listAgenciesPaged(org.id, {});
    const found = items.find((i) => i.id === agency.id);

    expect(found?.audit.createdByName).toBe("Usuária A");
    expect(found?.audit.updatedByName).toBe("Usuário B");
  });
});

describe("listSuppliersPaged — audit summary", () => {
  it("reporta o criador quando não há edição posterior", async () => {
    const supplier = await createSupplier(contextA, { name: "Fornecedor Auditado" });

    const { items } = await listSuppliersPaged(org.id, {});
    const found = items.find((i) => i.id === supplier.id);

    expect(found?.audit.createdByName).toBe("Usuária A");
    expect(found?.audit.updatedByName).toBe("Usuária A");
  });
});
