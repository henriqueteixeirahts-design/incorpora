import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createSpeInvestor } from "@/server/spe-people";
import { createInvestorReturn, listInvestorReturns } from "@/server/spe-investor-returns";

/**
 * docs/ESPEC_APORTES_INVESTIDORES.md, Etapa 4 — devolução/distribuição ao
 * investidor gera uma Payable (fornecedor = investidor, find-or-create),
 * segue o fluxo de aprovação normal do financeiro.
 */

let org: { id: string };
let otherOrg: { id: string };
let user: { id: string };
let context: AccessContext;
let investor: Awaited<ReturnType<typeof createSpeInvestor>>;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Devoluções Investidor" } });
  otherOrg = await prisma.organization.create({ data: { name: "Org — Devoluções Investidor (outra)" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "devolucoes-investidor@teste.local", fullName: "Usuário Devoluções" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Devoluções Investidor", document: "63265390000141", status: "ACTIVE",
    email: "spe-devolucoes@teste.local", phone: "62999990098",
  });

  investor = await createSpeInvestor(context, spe.id, {
    type: "INDIVIDUAL", name: "Investidor Devoluções", document: "02654427102",
    email: "investidor-devolucoes@teste.local", phone: "62999998803", modality: "LOAN",
    committedCapital: 100000,
  });

  await prisma.speInvestor.update({
    where: { id: investor.id },
    data: { returnBankName: "341 - Itaú", returnBankAgency: "1234", returnBankAccount: "56789-0" },
  });
});

afterAll(async () => {
  const orgIds = [org.id, otherOrg.id];
  await prisma.speInvestorReturn.deleteMany({ where: { investor: { spe: { organizationId: { in: orgIds } } } } });
  await prisma.payable.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.supplier.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.speInvestor.deleteMany({ where: { spe: { organizationId: { in: orgIds } } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("createInvestorReturn — gera Payable com fornecedor find-or-create", () => {
  it("amortização de mútuo: cria Payable categoria INVESTOR_RETURN com a conta de devolução do investidor", async () => {
    const ret = await createInvestorReturn(context, investor.id, {
      type: "LOAN_AMORTIZATION",
      amount: 15000,
      referenceDate: new Date(),
      dueDate: new Date(Date.now() + 10 * 86400000),
      notes: "1a amortização",
    });

    const payable = await prisma.payable.findUnique({ where: { id: ret.payableId }, include: { supplier: true } });
    expect(payable?.category).toBe("INVESTOR_RETURN");
    expect(Number(payable?.amount)).toBe(15000);
    expect(payable?.speId).toBe((await prisma.speInvestor.findUnique({ where: { id: investor.id } }))!.speId);
    expect(payable?.supplier?.speInvestorId).toBe(investor.id);
    expect(payable?.bankAccount).toContain("341 - Itaú");
    expect(payable?.status).toBe("ENTERED"); // segue o fluxo normal, não pula aprovação
  });

  it("distribuição de resultado: cria Payable categoria RESULT_DISTRIBUTION", async () => {
    const ret = await createInvestorReturn(context, investor.id, {
      type: "RESULT_DISTRIBUTION",
      amount: 8000,
      referenceDate: new Date(),
      dueDate: new Date(Date.now() + 10 * 86400000),
    });

    const payable = await prisma.payable.findUnique({ where: { id: ret.payableId } });
    expect(payable?.category).toBe("RESULT_DISTRIBUTION");
  });

  it("reaproveita o mesmo fornecedor (find-or-create) numa segunda devolução", async () => {
    await createInvestorReturn(context, investor.id, {
      type: "LOAN_AMORTIZATION", amount: 1000, referenceDate: new Date(), dueDate: new Date(Date.now() + 86400000),
    });
    const suppliers = await prisma.supplier.findMany({ where: { speInvestorId: investor.id } });
    expect(suppliers).toHaveLength(1);
  });

  it("isolamento por organização: devolução de uma org não aparece pra outra", async () => {
    const returns = await listInvestorReturns(context, investor.id);
    expect(returns.length).toBeGreaterThan(0);

    const otherContext: AccessContext = { ...context, organizationId: otherOrg.id };
    await expect(listInvestorReturns(otherContext, investor.id)).rejects.toThrow("Investidor não encontrado.");
  });
});
