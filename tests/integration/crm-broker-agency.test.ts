import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createAgency, createBroker, updateBroker, deleteBroker } from "@/server/crm";

/**
 * docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Etapa 2 — cadastro de
 * Corretor/Imobiliária revisado no padrão Customer/Permutante: unicidade de
 * documento por organização, endereço completo exige número, hierarquia de
 * gerente (managerId precisa apontar pra um Broker com role=MANAGER, sem
 * auto-referência), e os dois beneficiários fixos da imobiliária
 * (regional/produto) também precisam ser role=MANAGER.
 */

let org: { id: string };
let context: AccessContext;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Corretores e Imobiliárias" } });
  const actor = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "actor-crm-broker@teste.local", fullName: "Ator CRM" },
  });
  context = { userId: actor.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { organizationId: org.id } });
  await prisma.broker.deleteMany({ where: { organizationId: org.id } });
  await prisma.realEstateAgency.deleteMany({ where: { organizationId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.user.deleteMany({ where: { email: "actor-crm-broker@teste.local" } });
});

describe("Endereço — número obrigatório quando logradouro é informado", () => {
  it("rejeita corretor com street sem number", async () => {
    await expect(
      createBroker(context, { name: "Corretor Sem Número", street: "Rua das Flores" }),
    ).rejects.toThrow("Informe o número do endereço");
  });

  it("rejeita imobiliária com street sem number", async () => {
    await expect(
      createAgency(context, { name: "Imobiliária Sem Número", street: "Av. Central" }),
    ).rejects.toThrow("Informe o número do endereço");
  });
});

describe("Unicidade de documento por organização", () => {
  it("rejeita dois corretores com o mesmo CPF na mesma organização", async () => {
    await createBroker(context, { name: "Corretor Original", document: "05687849046" });
    await expect(
      createBroker(context, { name: "Corretor Duplicado", document: "05687849046" }),
    ).rejects.toThrow("Já existe um corretor cadastrado com este documento");
  });

  it("permite editar o próprio corretor mantendo o mesmo documento", async () => {
    const broker = await createBroker(context, { name: "Corretor Editável", document: "70292460086" });
    await expect(updateBroker(context, broker.id, { name: "Corretor Editável (renomeado)", document: "70292460086" })).resolves.toBeTruthy();
  });

  it("rejeita duas imobiliárias com o mesmo CNPJ na mesma organização", async () => {
    await createAgency(context, { name: "Imobiliária Original", document: "11444777000161" });
    await expect(
      createAgency(context, { name: "Imobiliária Duplicada", document: "11444777000161" }),
    ).rejects.toThrow("Já existe uma imobiliária cadastrada com este documento");
  });
});

describe("Hierarquia de gerente direto (Parte 1.3)", () => {
  it("rejeita managerId apontando pra um corretor sem role=MANAGER", async () => {
    const plainBroker = await createBroker(context, { name: "Corretor Comum" });
    await expect(
      createBroker(context, { name: "Corretor Subordinado", managerId: plainBroker.id }),
    ).rejects.toThrow("papel de Gerente");
  });

  it("aceita managerId apontando pra um corretor com role=MANAGER", async () => {
    const manager = await createBroker(context, { name: "Gerente Comercial X", role: "MANAGER" });
    const broker = await createBroker(context, { name: "Corretor Sob Gerência", managerId: manager.id });
    expect(broker.managerId).toBe(manager.id);
  });

  it("rejeita um corretor ser gerente de si mesmo", async () => {
    const manager = await createBroker(context, { name: "Gerente Auto-Referência", role: "MANAGER" });
    await expect(updateBroker(context, manager.id, { name: manager.name, managerId: manager.id })).rejects.toThrow(
      "não pode ser gerente de si mesmo",
    );
  });

  it("bloqueia excluir um gerente que ainda tem corretores sob ele", async () => {
    const manager = await createBroker(context, { name: "Gerente Com Equipe", role: "MANAGER" });
    await createBroker(context, { name: "Corretor Da Equipe", managerId: manager.id });
    await expect(deleteBroker(context, manager.id)).rejects.toThrow("corretores sob sua gerência");
  });
});

describe("Beneficiários fixos da imobiliária (Parte 3.2)", () => {
  it("rejeita regionalManagerBrokerId sem role=MANAGER", async () => {
    const plainBroker = await createBroker(context, { name: "Corretor Não-Gerente" });
    await expect(
      createAgency(context, { name: "Imobiliária Fixos Inválidos", regionalManagerBrokerId: plainBroker.id }),
    ).rejects.toThrow("papel de Gerente");
  });

  it("aceita regionalManagerBrokerId/productManagerBrokerId com role=MANAGER", async () => {
    const regional = await createBroker(context, { name: "Gerente Regional Y", role: "MANAGER" });
    const produto = await createBroker(context, { name: "Gerente de Produto Y", role: "MANAGER" });
    const agency = await createAgency(context, {
      name: "Imobiliária Fixos Válidos",
      regionalManagerBrokerId: regional.id,
      productManagerBrokerId: produto.id,
    });
    expect(agency.regionalManagerBrokerId).toBe(regional.id);
    expect(agency.productManagerBrokerId).toBe(produto.id);
  });
});

describe("Isolamento por organização", () => {
  it("documento duplicado em outra organização não bloqueia", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Org — Corretores (outra)" } });
    const otherContext: AccessContext = { ...context, organizationId: otherOrg.id };

    await createBroker(context, { name: "Corretor Org A", document: "92756843000" });
    await expect(createBroker(otherContext, { name: "Corretor Org B", document: "92756843000" })).resolves.toBeTruthy();

    await prisma.broker.deleteMany({ where: { organizationId: otherOrg.id } });
    await prisma.organization.delete({ where: { id: otherOrg.id } });
  });
});
