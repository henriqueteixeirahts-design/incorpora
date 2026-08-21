import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { createUnit } from "@/server/units";
import { createCustomer } from "@/server/customers";
import { createSalesTable, listSalesTables, getSalesTable } from "@/server/sales-tables";
import { createReservation } from "@/server/reservations";
import { createProposal } from "@/server/proposals";
import { getSale, listSalesPaged } from "@/server/sales";

/**
 * docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 2.5/2.6 — teste de fronteira do
 * funil comercial (reserva, proposta, venda, tabela de venda), mesmo molde
 * de tests/integration/development-access-scope.test.ts: um usuário
 * restrito ao Development X não vê/cria nada no Development Y da mesma
 * organização. Resposta esperada: "não encontrado"/lista vazia — nunca
 * "sem permissão".
 */

let org: { id: string };
let adminUser: { id: string };
let restrictedUser: { id: string };
let contextFull: AccessContext;
let contextRestricted: AccessContext;
let devX: { id: string };
let devY: { id: string };
let customerId: string;
let unitInDevY: { id: string };
let saleTableInDevY: { id: string };

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Escopo Funil Comercial" } });
  adminUser = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "admin-escopo-comercial@teste.local", fullName: "Admin Comercial" },
  });
  restrictedUser = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "corretor-escopo-comercial@teste.local", fullName: "Corretor Restrito Comercial" },
  });
  contextFull = { userId: adminUser.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(contextFull, {
    name: "SPE Escopo Comercial", document: "63265390000141", status: "ACTIVE",
    email: "spe-escopo-comercial@teste.local", phone: "62999990400",
  });
  devX = await createDevelopment(contextFull, { speId: spe.id, name: "Development X Comercial", type: "RESIDENTIAL_BUILDING" });
  devY = await createDevelopment(contextFull, { speId: spe.id, name: "Development Y Comercial", type: "RESIDENTIAL_BUILDING" });
  unitInDevY = await createUnit(contextFull, { developmentId: devY.id, unitType: "APARTMENT", number: "Y-201", referenceValue: 100000 });
  saleTableInDevY = await createSalesTable(contextFull, { developmentId: devY.id, name: "Tabela Y" });
  const customer = await createCustomer(contextFull, { type: "INDIVIDUAL", name: "Cliente Escopo Comercial", document: "02654427102" });
  customerId = customer.id;

  contextRestricted = {
    userId: restrictedUser.id,
    organizationId: org.id,
    roleNames: [],
    permissions: new Set(),
    developmentAccess: new Set([devX.id]),
  };
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.reservation.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.proposal.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.sale.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.salesTable.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, restrictedUser.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("Reserva — usuário restrito não cria reserva no empreendimento fora do escopo", () => {
  it("createReservation rejeita unidade do Y", async () => {
    await expect(
      createReservation(contextRestricted, { unitId: unitInDevY.id, customerId, expiresAt: new Date(Date.now() + 86400000) }),
    ).rejects.toThrow("Unidade inválida.");

    const leaked = await prisma.reservation.findFirst({ where: { unitId: unitInDevY.id } });
    expect(leaked).toBeNull();
  });
});

describe("Proposta — usuário restrito não cria proposta no empreendimento fora do escopo", () => {
  it("createProposal rejeita unidade do Y", async () => {
    await expect(
      createProposal(contextRestricted, { developmentId: devY.id, unitId: unitInDevY.id, customerId, discountPercent: 0 }),
    ).rejects.toThrow("Unidade inválida.");

    const leaked = await prisma.proposal.findFirst({ where: { developmentId: devY.id } });
    expect(leaked).toBeNull();
  });
});

describe("Venda — usuário restrito não vê venda do empreendimento fora do escopo", () => {
  it("getSale/listSalesPaged não retornam venda do Y", async () => {
    const proposal = await createProposal(contextFull, {
      developmentId: devY.id, unitId: unitInDevY.id, customerId, discountPercent: 0,
    });

    const sale = await prisma.sale.create({
      data: {
        organizationId: org.id,
        developmentId: devY.id,
        unitId: unitInDevY.id,
        proposalId: proposal.id,
        customerId,
        saleNumber: "V-TESTE-ESCOPO-0001",
        salePrice: 100000,
      },
    });

    expect(await getSale(contextRestricted, sale.id)).toBeNull();
    const own = await getSale(contextFull, sale.id);
    expect(own?.id).toBe(sale.id);

    const restrictedList = await listSalesPaged(contextRestricted, {});
    expect(restrictedList.items.map((s) => s.id)).not.toContain(sale.id);

    const fullList = await listSalesPaged(contextFull, {});
    expect(fullList.items.map((s) => s.id)).toContain(sale.id);
  });
});

describe("Tabela de venda — usuário restrito não vê/cria tabela no empreendimento fora do escopo", () => {
  it("listSalesTables: lista vazia pro Y", async () => {
    expect(await listSalesTables(contextRestricted, devY.id)).toEqual([]);
    const own = await listSalesTables(contextRestricted, devX.id);
    expect(own).toEqual([]); // X existe mas ainda não tem tabela criada
  });

  it("getSalesTable: null pra tabela do Y", async () => {
    expect(await getSalesTable(contextRestricted, saleTableInDevY.id)).toBeNull();
    expect(await getSalesTable(contextFull, saleTableInDevY.id)).not.toBeNull();
  });

  it("createSalesTable: rejeita criar no Y", async () => {
    await expect(
      createSalesTable(contextRestricted, { developmentId: devY.id, name: "Tabela Intrusa" }),
    ).rejects.toThrow("Empreendimento inválido.");

    const leaked = await prisma.salesTable.findFirst({ where: { developmentId: devY.id, name: "Tabela Intrusa" } });
    expect(leaked).toBeNull();
  });
});

describe("Regressão — acesso 'ALL' continua enxergando o funil comercial normalmente", () => {
  it("contextFull acessa X e Y sem restrição", async () => {
    expect(await listSalesTables(contextFull, devY.id)).not.toBeNull();
    const salesList = await listSalesPaged(contextFull, {});
    expect(Array.isArray(salesList.items)).toBe(true);
  });
});
