import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createCustomer, updateCustomer } from "@/server/customers";
import { ValidationError } from "@/lib/errors";

/**
 * docs/RELATORIO_TESTDRIVE.md, achado 4 — endereço com logradouro mas sem
 * número era aceito no cadastro de cliente, gerando contrato incompleto.
 * Regressão: garante que createCustomer/updateCustomer exigem número quando
 * um logradouro é informado, e que aceitam normalmente quando não há
 * endereço nenhum (cliente sem endereço ainda cadastrado).
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Validação de Endereço" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "endereco@teste.local", fullName: "Usuário Endereço" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };
});

afterAll(async () => {
  await prisma.customer.deleteMany({ where: { organizationId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.user.delete({ where: { id: user.id } });
});

describe("createCustomer — número do endereço obrigatório quando há logradouro", () => {
  it("rejeita logradouro sem número", async () => {
    await expect(
      createCustomer(context, {
        type: "INDIVIDUAL",
        name: "Cliente Sem Número",
        document: "02654427102",
        street: "Rua das Flores",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("aceita logradouro com número", async () => {
    const customer = await createCustomer(context, {
      type: "INDIVIDUAL",
      name: "Cliente Com Número",
      document: "11144477735",
      street: "Rua das Flores",
      number: "123",
    });
    expect(customer.number).toBe("123");
  });

  it("aceita cliente sem endereço nenhum (não exige número)", async () => {
    const customer = await createCustomer(context, {
      type: "INDIVIDUAL",
      name: "Cliente Sem Endereço",
      document: "93541134780",
    });
    expect(customer.street).toBeNull();
  });
});

describe("updateCustomer — mesma validação na edição", () => {
  it("rejeita adicionar logradouro sem número num update", async () => {
    const customer = await createCustomer(context, {
      type: "INDIVIDUAL",
      name: "Cliente Para Editar",
      document: "72165490607",
    });

    await expect(
      updateCustomer(context, customer.id, {
        type: "INDIVIDUAL",
        name: customer.name,
        document: customer.document,
        street: "Avenida Central",
      }),
    ).rejects.toThrow(ValidationError);
  });
});
