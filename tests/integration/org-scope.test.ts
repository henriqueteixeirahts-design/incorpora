import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import {
  createSpePartner,
  updateSpePartner,
  deleteSpePartner,
  createSpeInvestor,
  updateSpeInvestor,
  deleteSpeInvestor,
} from "@/server/spe-people";
import { createSpeLand, updateSpeLand, deleteSpeLand } from "@/server/spe-lands";
import { createDevelopment } from "@/server/developments";
import { createUnit } from "@/server/units";
import { createCustomer } from "@/server/customers";
import { createProposal } from "@/server/proposals";

/**
 * Teste de fronteira entre organizações (Pilar 1.4 de
 * docs/ESPEC_MULTITENANT_FUNDACOES.md) — cobre especificamente as
 * violações encontradas na auditoria de escopo (Pilar 1.2) e corrigidas
 * na mesma leva: um usuário da Org B nunca deve conseguir ler, editar ou
 * excluir um registro da Org A, mesmo sabendo o id exato. A resposta
 * correta é "não encontrado" — nunca "sem permissão" (não confirma
 * existência do registro de outra organização).
 */

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string };
let userB: { id: string };
let contextA: AccessContext;
let contextB: AccessContext;

beforeAll(async () => {
  orgA = await prisma.organization.create({ data: { name: "Org A — Teste de Fronteira" } });
  orgB = await prisma.organization.create({ data: { name: "Org B — Teste de Fronteira" } });

  userA = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "org-a-fronteira@teste.local", fullName: "Usuário Org A" },
  });
  userB = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "org-b-fronteira@teste.local", fullName: "Usuário Org B" },
  });

  contextA = { userId: userA.id, organizationId: orgA.id, roleNames: [], permissions: new Set() };
  contextB = { userId: userB.id, organizationId: orgB.id, roleNames: [], permissions: new Set() };
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await prisma.proposal.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: { in: [orgA.id, orgB.id] } } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await prisma.spePartner.deleteMany({ where: { spe: { organizationId: { in: [orgA.id, orgB.id] } } } });
  await prisma.speInvestor.deleteMany({ where: { spe: { organizationId: { in: [orgA.id, orgB.id] } } } });
  await prisma.speLand.deleteMany({ where: { spe: { organizationId: { in: [orgA.id, orgB.id] } } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
});

describe("Sub-entidades de SPE — Org B não acessa registros da Org A", () => {
  it("bloqueia update/delete de sócio, investidor e terreno de outra organização", async () => {
    const speA = await createSpe(contextA, {
      name: "SPE Org A",
      document: "63265390000141",
      status: "ACTIVE",
      email: "spe-a@teste.local",
      phone: "62999990000",
    });

    const partner = await createSpePartner(contextA, speA.id, {
      type: "INDIVIDUAL",
      name: "Sócio Org A",
      document: "02654427102",
      participationPct: 100,
    });
    const investor = await createSpeInvestor(contextA, speA.id, {
      type: "INDIVIDUAL",
      name: "Investidor Org A",
      document: "11144477735",
      email: "investidor-a@teste.local",
      phone: "62988887777",
      modality: "EQUITY",
    });
    const land = await createSpeLand(contextA, speA.id, {
      registrationNumber: "12345",
      registryOffice: "1º Cartório de Goiânia",
      totalArea: 5000,
      affectationEstablished: false,
    });

    const updateInput = {
      type: "INDIVIDUAL" as const,
      name: "Tentativa de sequestro",
      document: "02654427102",
      participationPct: 50,
    };

    // Org B tenta editar/excluir sabendo o speId e o id exatos da Org A — deve falhar como "não encontrado"
    await expect(updateSpePartner(contextB, speA.id, partner.id, updateInput)).rejects.toThrow(
      "Sócio não encontrado.",
    );
    await expect(deleteSpePartner(contextB, speA.id, partner.id)).rejects.toThrow("Sócio não encontrado.");

    await expect(
      updateSpeInvestor(contextB, speA.id, investor.id, {
        type: "INDIVIDUAL",
        name: "Tentativa de sequestro",
        document: "11144477735",
        email: "hack@teste.local",
        phone: "62900000000",
        modality: "EQUITY",
      }),
    ).rejects.toThrow("Investidor não encontrado.");
    await expect(deleteSpeInvestor(contextB, speA.id, investor.id)).rejects.toThrow("Investidor não encontrado.");

    await expect(
      updateSpeLand(contextB, speA.id, land.id, {
        registrationNumber: "99999",
        registryOffice: "Sequestrado",
        totalArea: 1,
        affectationEstablished: false,
      }),
    ).rejects.toThrow("Terreno não encontrado.");
    await expect(deleteSpeLand(contextB, speA.id, land.id)).rejects.toThrow("Terreno não encontrado.");

    // Confirma que o registro da Org A continua intacto (nada foi alterado pela tentativa)
    const stillThere = await prisma.spePartner.findUnique({ where: { id: partner.id } });
    expect(stillThere?.name).toBe("Sócio Org A");
    // Limpeza fica a cargo do afterAll (escopado por organizationId, cobre todas as tabelas tocadas aqui)
  });
});

describe("Proposta — Org B não consegue referenciar unidade/cliente de outra organização", () => {
  it("bloqueia criar proposta apontando pra unidade e cliente da Org A", async () => {
    const speEmpA = await createSpe(contextA, {
      name: "SPE Empreendimento Org A",
      document: "46127017000105",
      status: "ACTIVE",
      email: "spe-emp-a@teste.local",
      phone: "62999990001",
    });
    const developmentA = await createDevelopment(contextA, {
      speId: speEmpA.id,
      name: "Empreendimento Org A",
      type: "RESIDENTIAL_BUILDING",
    });
    const unitA = await createUnit(contextA, {
      developmentId: developmentA.id,
      unitType: "APARTMENT",
      number: "101",
      referenceValue: 500000,
    });
    const customerA = await createCustomer(contextA, {
      type: "INDIVIDUAL",
      name: "Cliente Org A",
      document: "02654427102",
      email: "cliente-a@teste.local",
      phone: "62999998888",
    });

    // Org B tenta criar proposta usando o developmentId/unitId reais da Org A
    await expect(
      createProposal(contextB, {
        developmentId: developmentA.id,
        unitId: unitA.id,
        customerId: customerA.id,
        discountPercent: 0,
      }),
    ).rejects.toThrow("Unidade inválida.");

    // Cria um development próprio da Org B, mas tenta usar o cliente da Org A
    const speEmpB = await createSpe(contextB, {
      name: "SPE Empreendimento Org B",
      document: "11444777000161",
      status: "ACTIVE",
      email: "spe-emp-b@teste.local",
      phone: "62999990002",
    });
    const developmentB = await createDevelopment(contextB, {
      speId: speEmpB.id,
      name: "Empreendimento Org B",
      type: "RESIDENTIAL_BUILDING",
    });
    const unitB = await createUnit(contextB, {
      developmentId: developmentB.id,
      unitType: "APARTMENT",
      number: "201",
      referenceValue: 400000,
    });

    await expect(
      createProposal(contextB, {
        developmentId: developmentB.id,
        unitId: unitB.id,
        customerId: customerA.id,
        discountPercent: 0,
      }),
    ).rejects.toThrow("Cliente inválido.");

    // Confirma que nenhuma proposta cross-org foi criada
    const leaked = await prisma.proposal.findFirst({ where: { unitId: unitA.id, organizationId: orgB.id } });
    expect(leaked).toBeNull();
    // Limpeza fica a cargo do afterAll (escopado por organizationId, cobre todas as tabelas tocadas aqui)
  });
});
