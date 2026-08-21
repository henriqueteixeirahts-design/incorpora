import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { createPermutante } from "@/server/permutantes";
import {
  upsertDistratoRule,
  getDistratoRule,
  getGeneralDistratoRule,
  listDistratoRuleOverrides,
} from "@/server/distrato-rules";
import { createCostCenter, updateCostCenter, deleteCostCenter, listCostCenters } from "@/server/finance-setup";
import {
  createExchangeContract,
  updateExchangeContract,
  getExchangeContractDetail,
  listExchangeContracts,
} from "@/server/exchange-contracts";

/**
 * docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 2.5 — mesmo padrão de
 * tests/integration/development-access-scope.test.ts (unico Development
 * X/Y dentro da MESMA organização; usuário restrito ao X não vê nem altera
 * nada do Y; resposta sempre "não encontrado"/lista vazia, nunca "sem
 * permissão"), agora cobrindo a config das 6 regras (aqui: distrato, como
 * amostra — as outras 5 seguem o mesmo código), centro de custo (Fundação
 * IMPORTANTE 2: `developmentId` opcional — a regra GERAL/"da organização"
 * nunca é restringível) e contrato de permuta.
 */

let org: { id: string };
let adminUser: { id: string };
let restrictedUser: { id: string };
let contextFull: AccessContext;
let contextRestricted: AccessContext; // developmentAccess = Set([devX.id]) só
let devX: { id: string };
let devY: { id: string };

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Escopo por Empreendimento (config)" } });
  adminUser = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "admin-escopo-config@teste.local", fullName: "Admin Escopo Config" },
  });
  restrictedUser = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "corretor-escopo-config@teste.local", fullName: "Corretor Restrito Config" },
  });
  contextFull = { userId: adminUser.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(contextFull, {
    name: "SPE Escopo Config", document: "63265390000141", status: "ACTIVE",
    email: "spe-escopo-config@teste.local", phone: "62999990400",
  });
  devX = await createDevelopment(contextFull, { speId: spe.id, name: "Development X Config", type: "RESIDENTIAL_BUILDING" });
  devY = await createDevelopment(contextFull, { speId: spe.id, name: "Development Y Config", type: "RESIDENTIAL_BUILDING" });

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
  await prisma.unit.updateMany({ where: { development: { organizationId: { in: orgIds } } }, data: { exchangeContractId: null } });
  await prisma.exchangeContractLand.deleteMany({ where: { exchangeContract: { development: { organizationId: { in: orgIds } } } } });
  await prisma.exchangeContract.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.permutante.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.payable.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.costCenter.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.distratoRule.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, restrictedUser.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("Regra de distrato — cascata geral × empreendimento respeita o escopo do usuário", () => {
  it("upsertDistratoRule: rejeita a regra do Y, aceita a do X", async () => {
    await expect(
      upsertDistratoRule(contextRestricted, devY.id, { retentionPercent: 20, reverseCommissionOnDistrato: true }),
    ).rejects.toThrow("Empreendimento inválido.");

    await expect(
      upsertDistratoRule(contextRestricted, devX.id, { retentionPercent: 20, reverseCommissionOnDistrato: true }),
    ).resolves.toBeTruthy();
  });

  it("getDistratoRule: null pro Y, retorna normalmente pro X", async () => {
    // Cria a regra do Y usando o contexto irrestrito (não deveria ser visível pro restrito).
    await upsertDistratoRule(contextFull, devY.id, { retentionPercent: 22, reverseCommissionOnDistrato: false });

    expect(await getDistratoRule(contextRestricted, devY.id)).toBeNull();
    const own = await getDistratoRule(contextRestricted, devX.id);
    expect(own?.developmentId).toBe(devX.id);
  });

  it("a regra GERAL da organização continua acessível ao usuário restrito — não é restringível por empreendimento", async () => {
    await upsertDistratoRule(contextFull, null, { retentionPercent: 25, reverseCommissionOnDistrato: true });

    const general = await getGeneralDistratoRule(contextRestricted);
    expect(general?.developmentId).toBeNull();
    expect(Number(general?.retentionPercent)).toBe(25);
  });

  it("listDistratoRuleOverrides: não vaza que o Y tem regra própria pro usuário restrito", async () => {
    const overridesRestricted = await listDistratoRuleOverrides(contextRestricted);
    expect(overridesRestricted.map((r) => r.developmentId)).toEqual([devX.id]);

    const overridesFull = await listDistratoRuleOverrides(contextFull);
    const ids = overridesFull.map((r) => r.developmentId).sort();
    expect(ids).toEqual([devX.id, devY.id].sort());
  });
});

describe("Centro de custo — developmentId opcional, 'da organização' nunca é restringível", () => {
  it("createCostCenter: rejeita vincular ao Y, aceita vincular ao X ou deixar sem empreendimento", async () => {
    await expect(
      createCostCenter(contextRestricted, { name: "CC Y", developmentId: devY.id }),
    ).rejects.toThrow("Empreendimento inválido.");

    const ccX = await createCostCenter(contextRestricted, { name: "CC X", developmentId: devX.id });
    expect(ccX.developmentId).toBe(devX.id);

    const ccOrg = await createCostCenter(contextRestricted, { name: "CC Organização" });
    expect(ccOrg.developmentId).toBeNull();
  });

  it("listCostCenters: usuário restrito vê o seu (X) e o 'da organização', mas não o do Y", async () => {
    const ccY = await createCostCenter(contextFull, { name: "CC Y — só admin", developmentId: devY.id });

    const listRestricted = await listCostCenters(contextRestricted);
    const namesRestricted = listRestricted.map((c) => c.name);
    expect(namesRestricted).toContain("CC X");
    expect(namesRestricted).toContain("CC Organização");
    expect(namesRestricted).not.toContain("CC Y — só admin");

    const listFull = await listCostCenters(contextFull);
    expect(listFull.map((c) => c.name)).toContain("CC Y — só admin");

    // limpeza do centro de custo criado só pelo admin pra não vazar pro próximo teste
    await deleteCostCenter(contextFull, ccY.id);
  });

  it("updateCostCenter: rejeita editar centro de custo do Y (mesmo sem mudar o developmentId)", async () => {
    const ccY = await createCostCenter(contextFull, { name: "CC Y — update", developmentId: devY.id });

    await expect(
      updateCostCenter(contextRestricted, ccY.id, { name: "Sequestrado", developmentId: devY.id }),
    ).rejects.toThrow("Centro de custo não encontrado.");

    const stillY = await prisma.costCenter.findUniqueOrThrow({ where: { id: ccY.id } });
    expect(stillY.name).toBe("CC Y — update");
  });

  it("deleteCostCenter: rejeita excluir centro de custo do Y", async () => {
    const ccY = await createCostCenter(contextFull, { name: "CC Y — delete", developmentId: devY.id });
    await expect(deleteCostCenter(contextRestricted, ccY.id)).rejects.toThrow("Centro de custo não encontrado.");
  });
});

describe("Contrato de permuta — developmentId direto, obrigatório", () => {
  it("createExchangeContract: rejeita criar no Y, aceita no X", async () => {
    const permutante = await createPermutante(contextFull, {
      type: "INDIVIDUAL", name: "Permutante Escopo Config", document: "02654427102",
    });

    await expect(
      createExchangeContract(contextRestricted, {
        developmentId: devY.id,
        permutanteId: permutante.id,
        type: "FINANCIAL",
        contractDate: new Date(),
        landIds: [],
      }),
    ).rejects.toThrow("Empreendimento não encontrado.");

    const contractX = await createExchangeContract(contextRestricted, {
      developmentId: devX.id,
      permutanteId: permutante.id,
      type: "FINANCIAL",
      contractDate: new Date(),
      landIds: [],
    });
    expect(contractX.developmentId).toBe(devX.id);

    const contractY = await createExchangeContract(contextFull, {
      developmentId: devY.id,
      permutanteId: permutante.id,
      type: "FINANCIAL",
      contractDate: new Date(),
      landIds: [],
    });

    // listExchangeContracts: lista o do X, "não encontrado" pro Y.
    const listX = await listExchangeContracts(contextRestricted, devX.id);
    expect(listX.map((c) => c.id)).toContain(contractX.id);
    await expect(listExchangeContracts(contextRestricted, devY.id)).rejects.toThrow("Empreendimento não encontrado.");

    // getExchangeContractDetail: null pro contrato do Y.
    expect(await getExchangeContractDetail(contextRestricted, contractY.id)).toBeNull();
    const detailX = await getExchangeContractDetail(contextRestricted, contractX.id);
    expect(detailX?.id).toBe(contractX.id);

    // updateExchangeContract: rejeita atualizar o do Y.
    await expect(
      updateExchangeContract(contextRestricted, contractY.id, {
        permutanteId: permutante.id,
        type: "FINANCIAL",
        contractDate: new Date(),
        landIds: [],
      }),
    ).rejects.toThrow("Contrato de permuta não encontrado.");
  });
});

describe("Regressão — acesso 'ALL' continua enxergando tudo, nos dois empreendimentos", () => {
  it("distrato, centro de custo e contrato de permuta: contextFull acessa X e Y normalmente", async () => {
    expect(await getDistratoRule(contextFull, devX.id)).not.toBeNull();
    expect(await getDistratoRule(contextFull, devY.id)).not.toBeNull();

    const costCentersFull = await listCostCenters(contextFull);
    expect(costCentersFull.length).toBeGreaterThan(0);

    const contractsY = await listExchangeContracts(contextFull, devY.id);
    expect(contractsY.length).toBeGreaterThan(0);
  });
});
