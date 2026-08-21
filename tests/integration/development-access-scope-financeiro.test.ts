import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { createUnit } from "@/server/units";
import { createCustomer } from "@/server/customers";
import { createSalesTable } from "@/server/sales-tables";
import { createProposal, submitProposalForApproval } from "@/server/proposals";
import { convertProposalToSale } from "@/server/sales";
import { createContract, markAwaitingSignature, confirmSignature } from "@/server/contracts";
import { createPayable, getPayableDetail, listPayablesPaged } from "@/server/payables";
import { createReceivable, getReceivableDetail, listReceivablesPaged } from "@/server/receivables-avulsos";
import { getPortfolioAging, getOverdueCustomerStages, getCustomerCollectionStage } from "@/server/aging";
import { getCashFlow } from "@/server/cash-flow";

/**
 * docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 2.5 — teste de fronteira do
 * escopo por EMPREENDIMENTO no módulo financeiro (payables, recebíveis
 * avulsos, aging/régua de cobrança, fluxo de caixa), no mesmo padrão de
 * tests/integration/development-access-scope.test.ts: organização única,
 * Development X (concedido ao usuário restrito) e Y (fora do escopo dele).
 * Resposta esperada em todo caso: "não encontrado"/lista vazia/valor
 * excluído do agregado — nunca "sem permissão".
 *
 * Caso especial coberto aqui (não existe em units/developments):
 * lançamentos "da organização" (sem `developmentId`, ex.: conta a
 * pagar/recebível avulso não vinculado a nenhum empreendimento) continuam
 * visíveis normalmente pro usuário restrito — só é bloqueado o que tem
 * `developmentId` fora do escopo dele.
 */

let org: { id: string };
let adminUser: { id: string };
let restrictedUser: { id: string };
let contextFull: AccessContext; // acesso "ALL"
let contextRestricted: AccessContext; // developmentAccess = Set([devX.id]) só
let devX: { id: string };
let devY: { id: string };
let speId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Escopo Financeiro" } });
  adminUser = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "admin-escopo-fin@teste.local", fullName: "Admin Escopo Financeiro" },
  });
  restrictedUser = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "corretor-escopo-fin@teste.local", fullName: "Corretor Restrito Financeiro" },
  });
  contextFull = { userId: adminUser.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(contextFull, {
    name: "SPE Escopo Financeiro", document: "63265390000909", status: "ACTIVE",
    email: "spe-escopo-fin@teste.local", phone: "62999990310",
  });
  speId = spe.id;
  devX = await createDevelopment(contextFull, { speId, name: "Development Financeiro X", type: "RESIDENTIAL_BUILDING" });
  devY = await createDevelopment(contextFull, { speId, name: "Development Financeiro Y", type: "RESIDENTIAL_BUILDING" });

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
  await prisma.installmentPayment.deleteMany({ where: { installment: { portfolio: { organizationId: { in: orgIds } } } } });
  await prisma.installment.deleteMany({ where: { portfolio: { organizationId: { in: orgIds } } } });
  await prisma.receivablePortfolio.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.commissionSplit.deleteMany({ where: { sale: { organizationId: { in: orgIds } } } });
  await prisma.contract.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.sale.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.proposal.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.salesTable.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.receivable.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.payable.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, restrictedUser.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("Payable — usuário restrito não vê/cria conta a pagar fora do escopo, mas vê a da organização", () => {
  it("getPayableDetail: null pra conta do Y, ok pra conta do X e pra conta sem empreendimento", async () => {
    const payableY = await createPayable(contextFull, {
      developmentId: devY.id, category: "ADMINISTRATION", description: "Conta Y",
      competenceDate: new Date(), dueDate: new Date(), amount: 1000,
    });
    const payableX = await createPayable(contextFull, {
      developmentId: devX.id, category: "ADMINISTRATION", description: "Conta X",
      competenceDate: new Date(), dueDate: new Date(), amount: 1000,
    });
    const payableOrg = await createPayable(contextFull, {
      category: "ADMINISTRATION", description: "Conta da organização",
      competenceDate: new Date(), dueDate: new Date(), amount: 1000,
    });

    expect(await getPayableDetail(contextRestricted, payableY.id)).toBeNull();
    expect((await getPayableDetail(contextRestricted, payableX.id))?.id).toBe(payableX.id);
    expect((await getPayableDetail(contextRestricted, payableOrg.id))?.id).toBe(payableOrg.id);
  });

  it("listPayablesPaged: exclui a do Y, inclui a do X e a sem empreendimento", async () => {
    const { items } = await listPayablesPaged(contextRestricted, { search: "Conta" });
    const developmentIds = items.map((p) => p.developmentId);
    expect(developmentIds).not.toContain(devY.id);
    expect(developmentIds).toContain(devX.id);
    expect(developmentIds).toContain(null);
  });

  it("createPayable: rejeita apontando pro Y", async () => {
    await expect(
      createPayable(contextRestricted, {
        developmentId: devY.id, category: "ADMINISTRATION", description: "Conta sequestrada",
        competenceDate: new Date(), dueDate: new Date(), amount: 1,
      }),
    ).rejects.toThrow("Empreendimento inválido.");

    const leaked = await prisma.payable.findFirst({ where: { developmentId: devY.id, description: "Conta sequestrada" } });
    expect(leaked).toBeNull();
  });

  it("createPayable: aceita apontando pro X e sem empreendimento", async () => {
    const ownDev = await createPayable(contextRestricted, {
      developmentId: devX.id, category: "ADMINISTRATION", description: "Conta X pelo restrito",
      competenceDate: new Date(), dueDate: new Date(), amount: 1,
    });
    expect(ownDev.developmentId).toBe(devX.id);

    const orgWide = await createPayable(contextRestricted, {
      category: "ADMINISTRATION", description: "Conta org pelo restrito",
      competenceDate: new Date(), dueDate: new Date(), amount: 1,
    });
    expect(orgWide.developmentId).toBeNull();
  });
});

describe("Receivable avulso — mesma regra do Payable", () => {
  it("getReceivableDetail: null pro Y, ok pro X e pro sem empreendimento", async () => {
    const receivableY = await createReceivable(contextFull, {
      developmentId: devY.id, category: "OTHER", origin: "Recebível Y", dueDate: new Date(), amount: 500,
    });
    const receivableX = await createReceivable(contextFull, {
      developmentId: devX.id, category: "OTHER", origin: "Recebível X", dueDate: new Date(), amount: 500,
    });
    const receivableOrg = await createReceivable(contextFull, {
      category: "OTHER", origin: "Recebível da organização", dueDate: new Date(), amount: 500,
    });

    expect(await getReceivableDetail(contextRestricted, receivableY.id)).toBeNull();
    expect((await getReceivableDetail(contextRestricted, receivableX.id))?.id).toBe(receivableX.id);
    expect((await getReceivableDetail(contextRestricted, receivableOrg.id))?.id).toBe(receivableOrg.id);
  });

  it("listReceivablesPaged: exclui o do Y, inclui o do X e o sem empreendimento", async () => {
    const { items } = await listReceivablesPaged(contextRestricted, { search: "Recebível" });
    const developmentIds = items.map((r) => r.developmentId);
    expect(developmentIds).not.toContain(devY.id);
    expect(developmentIds).toContain(devX.id);
    expect(developmentIds).toContain(null);
  });

  it("createReceivable: rejeita apontando pro Y", async () => {
    await expect(
      createReceivable(contextRestricted, {
        developmentId: devY.id, category: "OTHER", origin: "Recebível sequestrado", dueDate: new Date(), amount: 1,
      }),
    ).rejects.toThrow("Empreendimento inválido.");
  });
});

describe("Aging/régua de cobrança — usuário restrito só considera contratos do seu escopo", () => {
  async function setUpOverdueContract(devId: string, unitNumber: string) {
    const unit = await createUnit(contextFull, { developmentId: devId, unitType: "APARTMENT", number: unitNumber, referenceValue: 200000 });
    const customer = await createCustomer(contextFull, { type: "INDIVIDUAL", name: `Cliente ${unitNumber}`, document: `6${unitNumber.padStart(10, "0")}` });
    const salesTable = await createSalesTable(contextFull, { developmentId: devId, name: `Tabela ${unitNumber}`, downPaymentPercent: 20, monthlyInstallments: 4 });
    const proposal = await createProposal(contextFull, {
      developmentId: devId, unitId: unit.id, customerId: customer.id, salesTableId: salesTable.id, discountPercent: 0,
    });
    await submitProposalForApproval(contextFull, proposal.id);
    const sale = await convertProposalToSale(contextFull, proposal.id);
    const contract = await createContract(contextFull, sale.id);
    await markAwaitingSignature(contextFull, contract.id);
    await confirmSignature(contextFull, contract.id);

    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
    const overdue = portfolio.installments.find((i) => !i.isDownPayment)!;
    await prisma.installment.update({ where: { id: overdue.id }, data: { dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } });

    return { contract, customer };
  }

  it("getPortfolioAging: restrito não vê parcela do Y, admin vê nos dois", async () => {
    const { contract: contractY } = await setUpOverdueContract(devY.id, "FY101");

    const agingRestricted = await getPortfolioAging(contextRestricted, {});
    expect(agingRestricted.rows.some((r) => r.contractId === contractY.id)).toBe(false);

    const agingFull = await getPortfolioAging(contextFull, {});
    expect(agingFull.rows.some((r) => r.contractId === contractY.id)).toBe(true);
  });

  it("getPortfolioAging com filtro developmentId=Y explícito devolve lista vazia pro restrito", async () => {
    const agingFiltered = await getPortfolioAging(contextRestricted, { developmentId: devY.id });
    expect(agingFiltered.rows).toEqual([]);
  });

  it("getOverdueCustomerStages / getCustomerCollectionStage: restrito não vê cliente cuja única parcela em atraso é do Y", async () => {
    const { customer } = await setUpOverdueContract(devY.id, "FY102");

    const stagesRestricted = await getOverdueCustomerStages(contextRestricted);
    expect(stagesRestricted.find((s) => s.customerId === customer.id)).toBeUndefined();

    const stageRestricted = await getCustomerCollectionStage(contextRestricted, customer.id);
    expect(stageRestricted).toBeNull();

    const stageFull = await getCustomerCollectionStage(contextFull, customer.id);
    expect(stageFull).not.toBeNull();
  });
});

describe("Fluxo de caixa — restrito só soma o que está no escopo dele, sempre soma o que é da organização", () => {
  it("getCashFlow sem filtro: exclui a fração do Y, inclui a do X e a sem empreendimento", async () => {
    const dueDate = new Date();
    const beforeRestricted = await getCashFlow(contextRestricted, { granularity: "daily", daysBack: 0, daysForward: 0 });
    const beforeFull = await getCashFlow(contextFull, { granularity: "daily", daysBack: 0, daysForward: 0 });

    await createPayable(contextFull, {
      developmentId: devY.id, category: "ADMINISTRATION", description: "Fluxo Y", competenceDate: dueDate, dueDate, amount: 9000,
    });
    await createPayable(contextFull, {
      developmentId: devX.id, category: "ADMINISTRATION", description: "Fluxo X", competenceDate: dueDate, dueDate, amount: 4000,
    });
    await createPayable(contextFull, {
      category: "ADMINISTRATION", description: "Fluxo organização", competenceDate: dueDate, dueDate, amount: 2000,
    });

    const afterRestricted = await getCashFlow(contextRestricted, { granularity: "daily", daysBack: 0, daysForward: 0 });
    const afterFull = await getCashFlow(contextFull, { granularity: "daily", daysBack: 0, daysForward: 0 });

    // Restrito: só vê a fração de X (4000) + organização (2000) = 6000, nunca os 9000 do Y.
    expect(afterRestricted[0].payablesForecast - beforeRestricted[0].payablesForecast).toBe(6000);
    // Admin ("ALL"): vê tudo, os 15000.
    expect(afterFull[0].payablesForecast - beforeFull[0].payablesForecast).toBe(15000);
  });

  it("getCashFlow com developmentId=Y explícito: restrito não vê nada (fora do escopo), admin vê", async () => {
    const dueDate = new Date();
    const restrictedBuckets = await getCashFlow(contextRestricted, { developmentId: devY.id, granularity: "daily", daysBack: 0, daysForward: 0 });
    expect(restrictedBuckets[0].payablesForecast).toBe(0);

    await createPayable(contextFull, {
      developmentId: devY.id, category: "ADMINISTRATION", description: "Fluxo Y filtro explícito", competenceDate: dueDate, dueDate, amount: 777,
    });

    const restrictedAfter = await getCashFlow(contextRestricted, { developmentId: devY.id, granularity: "daily", daysBack: 0, daysForward: 0 });
    expect(restrictedAfter[0].payablesForecast).toBe(0);

    const fullAfter = await getCashFlow(contextFull, { developmentId: devY.id, granularity: "daily", daysBack: 0, daysForward: 0 });
    expect(fullAfter[0].payablesForecast).toBeGreaterThanOrEqual(777);
  });
});

describe("Regressão — contextFull ('ALL') continua enxergando tudo, financeiro incluso", () => {
  it("getPayableDetail/getReceivableDetail/listPayablesPaged/listReceivablesPaged sem restrição nenhuma", async () => {
    const payable = await createPayable(contextFull, {
      developmentId: devY.id, category: "ADMINISTRATION", description: "Regressão ALL payable",
      competenceDate: new Date(), dueDate: new Date(), amount: 1,
    });
    const receivable = await createReceivable(contextFull, {
      developmentId: devY.id, category: "OTHER", origin: "Regressão ALL receivable", dueDate: new Date(), amount: 1,
    });

    expect((await getPayableDetail(contextFull, payable.id))?.id).toBe(payable.id);
    expect((await getReceivableDetail(contextFull, receivable.id))?.id).toBe(receivable.id);

    const { items: payableItems } = await listPayablesPaged(contextFull, { developmentId: devY.id });
    expect(payableItems.some((p) => p.id === payable.id)).toBe(true);

    const { items: receivableItems } = await listReceivablesPaged(contextFull, { developmentId: devY.id });
    expect(receivableItems.some((r) => r.id === receivable.id)).toBe(true);
  });
});
