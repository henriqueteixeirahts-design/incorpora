import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment, getDevelopment, updateDevelopment, deleteDevelopment } from "@/server/developments";
import { listUnits, createUnit, updateUnitStatus, linkUnits } from "@/server/units";

/**
 * docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 2.5/2.6 — teste de fronteira
 * pro escopo por EMPREENDIMENTO, no mesmo padrão do teste Org A × Org B já
 * existente (tests/integration/org-scope.test.ts), mas dentro da MESMA
 * organização: um usuário (ex.: corretor) com `AccessGrant` restrito ao
 * Development X não deve ver/alterar nada do Development Y, mesmo os dois
 * pertencendo à mesma organização. Resposta esperada em todo caso: "não
 * encontrado"/lista vazia — nunca "sem permissão" (mesma convenção de
 * não confirmar a existência de um registro fora do alcance do usuário).
 *
 * Módulo de referência (units.ts + developments.ts) — os demais módulos
 * (vendas, propostas, reservas, contratos, financeiro...) ganham o mesmo
 * padrão de teste ao serem fechados, um por um.
 */

let org: { id: string };
let adminUser: { id: string };
let restrictedUser: { id: string };
let contextFull: AccessContext; // acesso "ALL" — não deveria ser afetado por nada aqui
let contextRestricted: AccessContext; // developmentAccess = Set([devX.id]) só
let devX: { id: string };
let devY: { id: string };
let unitInDevY: { id: string };

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Escopo por Empreendimento" } });
  adminUser = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "admin-escopo-dev@teste.local", fullName: "Admin Escopo" },
  });
  restrictedUser = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "corretor-escopo-dev@teste.local", fullName: "Corretor Restrito" },
  });
  contextFull = { userId: adminUser.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(contextFull, {
    name: "SPE Escopo Dev", document: "63265390000141", status: "ACTIVE",
    email: "spe-escopo-dev@teste.local", phone: "62999990300",
  });
  devX = await createDevelopment(contextFull, { speId: spe.id, name: "Development X", type: "RESIDENTIAL_BUILDING" });
  devY = await createDevelopment(contextFull, { speId: spe.id, name: "Development Y", type: "RESIDENTIAL_BUILDING" });
  unitInDevY = await createUnit(contextFull, { developmentId: devY.id, unitType: "APARTMENT", number: "Y-101", referenceValue: 100000 });

  // Corretor com AccessGrant restrito só ao Development X — igual ao que a
  // tela de cadastro de usuário (Parte 2.4) vai gravar quando alguém
  // escolher "empreendimento específico" em vez de "Todos".
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
  await prisma.unitLink.deleteMany({ where: { principalUnit: { development: { organizationId: { in: orgIds } } } } });
  await prisma.unitStatusHistory.deleteMany({ where: { unit: { development: { organizationId: { in: orgIds } } } } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, restrictedUser.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("Development — usuário restrito não vê/altera o empreendimento fora do escopo", () => {
  it("getDevelopment: null pro Y, retorna normalmente pro X", async () => {
    expect(await getDevelopment(contextRestricted, devY.id)).toBeNull();
    const own = await getDevelopment(contextRestricted, devX.id);
    expect(own?.id).toBe(devX.id);
  });

  it("updateDevelopment: rejeita pro Y com 'não encontrado', nunca 'sem permissão'", async () => {
    await expect(
      updateDevelopment(contextRestricted, devY.id, { speId: (await getDevelopment(contextFull, devY.id))!.speId, name: "Sequestrado", type: "RESIDENTIAL_BUILDING" }),
    ).rejects.toThrow("Empreendimento não encontrado.");

    // Confirma que não alterou nada — Y continua com o nome original.
    const stillY = await getDevelopment(contextFull, devY.id);
    expect(stillY?.name).toBe("Development Y");
  });

  it("deleteDevelopment: rejeita pro Y", async () => {
    await expect(deleteDevelopment(contextRestricted, devY.id)).rejects.toThrow("Empreendimento não encontrado.");
  });
});

describe("Unit — usuário restrito não vê/altera unidade de um empreendimento fora do escopo", () => {
  it("listUnits: lista vazia pro Y, lista normal pro X", async () => {
    expect(await listUnits(contextRestricted, devY.id)).toEqual([]);
    expect(await listUnits(contextRestricted, devX.id)).toEqual([]); // X existe mas ainda não tem unidade criada
  });

  it("createUnit: rejeita criar unidade no Y", async () => {
    await expect(
      createUnit(contextRestricted, { developmentId: devY.id, unitType: "APARTMENT", number: "Y-999", referenceValue: 1 }),
    ).rejects.toThrow("Empreendimento inválido.");

    const leaked = await prisma.unit.findFirst({ where: { developmentId: devY.id, number: "Y-999" } });
    expect(leaked).toBeNull();
  });

  it("updateUnitStatus: rejeita alterar status de unidade do Y", async () => {
    await expect(updateUnitStatus(contextRestricted, unitInDevY.id, "BLOCKED")).rejects.toThrow("Unidade inválida.");

    const stillAvailable = await prisma.unit.findUniqueOrThrow({ where: { id: unitInDevY.id } });
    expect(stillAvailable.status).toBe("AVAILABLE");
  });

  it("linkUnits: rejeita vincular unidades do Y", async () => {
    const accessoryInY = await createUnit(contextFull, {
      developmentId: devY.id, unitType: "PARKING_SPACE", isAccessory: true, number: "Y-VAGA-1", referenceValue: 1,
    });
    await expect(
      linkUnits(contextRestricted, unitInDevY.id, accessoryInY.id, "MANDATORY", "INCLUDED_IN_PRICE"),
    ).rejects.toThrow("Unidade inválida.");
  });
});

describe("Regressão — acesso 'ALL' continua enxergando tudo, nos dois empreendimentos", () => {
  it("contextFull acessa X e Y normalmente", async () => {
    expect(await getDevelopment(contextFull, devX.id)).not.toBeNull();
    expect(await getDevelopment(contextFull, devY.id)).not.toBeNull();
    const unitsY = await listUnits(contextFull, devY.id);
    expect(unitsY.length).toBeGreaterThan(0);
  });
});
