import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { createUnit } from "@/server/units";
import { createPermutante, DuplicatePermutanteDocumentError } from "@/server/permutantes";
import {
  createExchangeContract,
  updateExchangeContract,
  destacarUnidade,
  removerDestaque,
} from "@/server/exchange-contracts";

/**
 * docs/ESPEC_MODULO_COMERCIAL.md etapa 1 + docs/ESPEC_PERMUTANTES.md etapas
 * 1-2: cadastro do contrato de permuta, destaque de unidade a partir de
 * AVAILABLE, e a alternância "gestão pelo sistema" cascateando o status das
 * unidades destacadas (EXCHANGE <-> AVAILABLE). Isolamento entre
 * organizações no padrão de tests/integration/org-scope*.test.ts.
 */

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string };
let userB: { id: string };
let contextA: AccessContext;
let contextB: AccessContext;

let developmentA: Awaited<ReturnType<typeof createDevelopment>>;
let permutanteA: Awaited<ReturnType<typeof createPermutante>>;

beforeAll(async () => {
  orgA = await prisma.organization.create({ data: { name: "Org A — Permuta" } });
  orgB = await prisma.organization.create({ data: { name: "Org B — Permuta" } });

  userA = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "org-a-permuta@teste.local", fullName: "Usuário Org A" },
  });
  userB = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "org-b-permuta@teste.local", fullName: "Usuário Org B" },
  });

  contextA = { userId: userA.id, organizationId: orgA.id, roleNames: [], permissions: new Set() };
  contextB = { userId: userB.id, organizationId: orgB.id, roleNames: [], permissions: new Set() };

  const speA = await createSpe(contextA, {
    name: "SPE Permuta A",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-permuta-a@teste.local",
    phone: "62999990010",
  });

  developmentA = await createDevelopment(contextA, {
    speId: speA.id,
    name: "Empreendimento Permuta A",
    type: "RESIDENTIAL_BUILDING",
  });

  permutanteA = await createPermutante(contextA, {
    type: "INDIVIDUAL",
    name: "Permutante Teste A",
    document: "02654427102",
  });
});

afterAll(async () => {
  const orgIds = [orgA.id, orgB.id];
  await prisma.unit.updateMany({
    where: { development: { organizationId: { in: orgIds } } },
    data: { exchangeContractId: null },
  });
  await prisma.exchangeContractLand.deleteMany({ where: { exchangeContract: { development: { organizationId: { in: orgIds } } } } });
  await prisma.exchangeContract.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.permutante.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("Permutante", () => {
  it("bloqueia documento duplicado na mesma organização", async () => {
    await expect(
      createPermutante(contextA, { type: "INDIVIDUAL", name: "Outro nome", document: permutanteA.document }),
    ).rejects.toThrow(DuplicatePermutanteDocumentError);
  });
});

describe("Contrato de permuta — destaque de unidade física", () => {
  it("destaca unidade só a partir de AVAILABLE, e bloqueia destaque duplo", async () => {
    const unit = await createUnit(contextA, {
      developmentId: developmentA.id,
      unitType: "APARTMENT",
      number: "101",
    });

    const contract = await createExchangeContract(contextA, {
      developmentId: developmentA.id,
      permutanteId: permutanteA.id,
      type: "PHYSICAL",
      contractDate: new Date("2026-01-10"),
      landIds: [],
    });
    expect(contract.managedBySystem).toBe(true);

    const destacada = await destacarUnidade(contextA, contract.id, unit.id);
    expect(destacada.exchangeContractId).toBe(contract.id);
    expect(destacada.status).toBe("AVAILABLE");

    await expect(destacarUnidade(contextA, contract.id, unit.id)).rejects.toThrow(
      "já destacada",
    );

    const other = await createUnit(contextA, {
      developmentId: developmentA.id,
      unitType: "APARTMENT",
      number: "102",
    });
    await prisma.unit.update({ where: { id: other.id }, data: { status: "RESERVED" } });
    await expect(destacarUnidade(contextA, contract.id, other.id)).rejects.toThrow("disponíveis");
  });

  it("gestão fora do sistema muda a unidade destacada pra EXCHANGE; voltar pra sob gestão restaura AVAILABLE", async () => {
    const unit = await createUnit(contextA, {
      developmentId: developmentA.id,
      unitType: "LOT",
      number: "L01",
    });

    const contract = await createExchangeContract(contextA, {
      developmentId: developmentA.id,
      permutanteId: permutanteA.id,
      type: "PHYSICAL",
      contractDate: new Date("2026-02-01"),
      managedBySystem: true,
      landIds: [],
    });

    await destacarUnidade(contextA, contract.id, unit.id);

    await updateExchangeContract(contextA, contract.id, {
      permutanteId: permutanteA.id,
      type: "PHYSICAL",
      contractDate: new Date("2026-02-01"),
      managedBySystem: false,
      landIds: [],
    });

    const afterOff = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(afterOff.status).toBe("EXCHANGE");

    await updateExchangeContract(contextA, contract.id, {
      permutanteId: permutanteA.id,
      type: "PHYSICAL",
      contractDate: new Date("2026-02-01"),
      managedBySystem: true,
      landIds: [],
    });

    const afterOn = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(afterOn.status).toBe("AVAILABLE");
  });

  it("remove destaque e libera a unidade de volta pra AVAILABLE quando estava EXCHANGE", async () => {
    const unit = await createUnit(contextA, {
      developmentId: developmentA.id,
      unitType: "LOT",
      number: "L02",
    });

    const contract = await createExchangeContract(contextA, {
      developmentId: developmentA.id,
      permutanteId: permutanteA.id,
      type: "PHYSICAL",
      contractDate: new Date("2026-02-05"),
      managedBySystem: false,
      landIds: [],
    });

    await destacarUnidade(contextA, contract.id, unit.id);
    const destacada = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(destacada.status).toBe("EXCHANGE");

    await removerDestaque(contextA, contract.id, unit.id);
    const removida = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(removida.exchangeContractId).toBeNull();
    expect(removida.status).toBe("AVAILABLE");
  });
});

describe("isolamento entre organizações", () => {
  it("Org B não cria contrato nem destaca unidade do empreendimento da Org A", async () => {
    const unit = await createUnit(contextA, {
      developmentId: developmentA.id,
      unitType: "APARTMENT",
      number: "201",
    });

    await expect(
      createExchangeContract(contextB, {
        developmentId: developmentA.id,
        permutanteId: permutanteA.id,
        type: "PHYSICAL",
        contractDate: new Date("2026-03-01"),
        landIds: [],
      }),
    ).rejects.toThrow();

    const contract = await createExchangeContract(contextA, {
      developmentId: developmentA.id,
      permutanteId: permutanteA.id,
      type: "PHYSICAL",
      contractDate: new Date("2026-03-01"),
      landIds: [],
    });

    await expect(destacarUnidade(contextB, contract.id, unit.id)).rejects.toThrow();
  });
});
