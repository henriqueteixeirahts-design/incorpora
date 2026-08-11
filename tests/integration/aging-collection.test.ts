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
import { getPortfolioAging, getOverdueCustomerStages, getCustomerCollectionStage } from "@/server/aging";
import { upsertCollectionRule } from "@/server/collection-rules";
import { logCollectionContact, listCollectionHistory } from "@/server/collection-log";

/**
 * Fase B, etapa 2 (docs/ESPEC_FASE_B_CARTEIRA_FINANCEIRO_1.md, Parte 3) —
 * aging da carteira por faixa de atraso + régua de cobrança assistida.
 * Rigor: faixas conferidas com dias em atraso controlados manualmente
 * (dueDate escrito direto no banco), régua resolvida contra a etapa
 * assistida configurada por empreendimento.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;
let customerSeq = 0;

function nextDocument() {
  customerSeq += 1;
  return `6${String(customerSeq).padStart(10, "0")}`;
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function daysFromNow(n: number) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

async function setUpSignedContract(unitNumber: string, devId: string = developmentId) {
  const unit = await createUnit(context, {
    developmentId: devId,
    unitType: "APARTMENT",
    number: unitNumber,
    referenceValue: 200000,
  });
  const customer = await createCustomer(context, { type: "INDIVIDUAL", name: `Cliente ${unitNumber}`, document: nextDocument() });
  const salesTable = await createSalesTable(context, {
    developmentId: devId,
    name: `Tabela ${unitNumber}`,
    downPaymentPercent: 20,
    monthlyInstallments: 4,
  });
  const proposal = await createProposal(context, {
    developmentId: devId,
    unitId: unit.id,
    customerId: customer.id,
    salesTableId: salesTable.id,
    discountPercent: 0,
  });
  await submitProposalForApproval(context, proposal.id);
  const sale = await convertProposalToSale(context, proposal.id);
  const contract = await createContract(context, sale.id);
  await markAwaitingSignature(context, contract.id);
  await confirmSignature(context, contract.id);
  return { contract, customer, sale };
}

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Aging" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "aging@teste.local", fullName: "Usuário Aging" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set() };

  const spe = await createSpe(context, {
    name: "SPE Aging",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-aging@teste.local",
    phone: "62999990100",
  });
  const development = await createDevelopment(context, { speId: spe.id, name: "Empreendimento Aging", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.collectionContactLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.collectionRuleStep.deleteMany({ where: { collectionRule: { development: { organizationId: { in: orgIds } } } } });
  await prisma.collectionRule.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
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
  await prisma.developmentEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("Aging da carteira — faixas de atraso", () => {
  it("classifica cada parcela na faixa certa e soma os valores corrigidos por faixa", async () => {
    const { contract } = await setUpSignedContract("AG101");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    const parcelas = portfolio.installments.filter((i) => !i.isDownPayment).sort((a, b) => a.sequence - b.sequence);
    const entrada = portfolio.installments.find((i) => i.isDownPayment)!;

    // Entrada: a vencer em 10 dias -> bucket A_VENCER_30D.
    await prisma.installment.update({ where: { id: entrada.id }, data: { dueDate: daysFromNow(10) } });
    // Parcela 1: vencida há 10 dias -> D1_15.
    await prisma.installment.update({ where: { id: parcelas[0].id }, data: { dueDate: daysAgo(10) } });
    // Parcela 2: vencida há 20 dias -> D16_30.
    await prisma.installment.update({ where: { id: parcelas[1].id }, data: { dueDate: daysAgo(20) } });
    // Parcela 3: vencida há 45 dias -> D31_60.
    await prisma.installment.update({ where: { id: parcelas[2].id }, data: { dueDate: daysAgo(45) } });
    // Parcela 4: vencida há 100 dias -> D90_PLUS.
    await prisma.installment.update({ where: { id: parcelas[3].id }, data: { dueDate: daysAgo(100) } });

    const aging = await getPortfolioAging(org.id, {});
    const byBucket = Object.fromEntries(aging.summaries.map((s) => [s.bucket, s]));

    expect(byBucket.A_VENCER_30D.installmentCount).toBe(1);
    expect(byBucket.A_VENCER_30D.totalValue).toBe(40000);
    expect(byBucket.D1_15.installmentCount).toBe(1);
    expect(byBucket.D16_30.installmentCount).toBe(1);
    expect(byBucket.D31_60.installmentCount).toBe(1);
    expect(byBucket.D61_90.installmentCount).toBe(0);
    expect(byBucket.D90_PLUS.installmentCount).toBe(1);

    // Sem índice cadastrado, o fator é 1 — a parcela vencida há 100 dias soma multa 2% + mora 1%/mês.
    const row90 = aging.rows.find((r) => r.bucket === "D90_PLUS")!;
    expect(row90.daysOverdue).toBe(100);
    // multa: 40000*0.02=800; mora: 40000*0.01*(100/30)=1333.33; total=42133.33
    expect(row90.resultValue).toBe(42133.33);
  });

  it("filtro por empreendimento exclui parcelas de outro empreendimento", async () => {
    const spe = await prisma.development.findFirstOrThrow({ where: { id: developmentId } });
    const otherDevelopment = await createDevelopment(context, { speId: spe.speId, name: "Outro empreendimento Aging", type: "RESIDENTIAL_BUILDING" });
    const { contract: otherContract } = await setUpSignedContract("AG102", otherDevelopment.id);
    const otherPortfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: otherContract.id }, include: { installments: true } });
    const otherOverdue = otherPortfolio.installments.find((i) => !i.isDownPayment)!;
    await prisma.installment.update({ where: { id: otherOverdue.id }, data: { dueDate: daysAgo(5) } });

    const agingFiltered = await getPortfolioAging(org.id, { developmentId: otherDevelopment.id });
    expect(agingFiltered.rows.every((r) => r.developmentId === otherDevelopment.id)).toBe(true);
    expect(agingFiltered.rows.some((r) => r.installmentId === otherOverdue.id)).toBe(true);
  });

  it("filtro por faixa de valor exclui parcelas fora do intervalo", async () => {
    const aging = await getPortfolioAging(org.id, { minValue: 1000000 });
    expect(aging.rows).toHaveLength(0);
  });
});

describe("Régua de cobrança", () => {
  it("usa a régua default quando o empreendimento não tem uma configurada", async () => {
    const { customer } = await setUpSignedContract("AG201");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contract: { customerId: customer.id } },
      include: { installments: true },
    });
    const parcela = portfolio.installments.find((i) => !i.isDownPayment)!;
    await prisma.installment.update({ where: { id: parcela.id }, data: { dueDate: daysAgo(10) } });

    const stage = await getCustomerCollectionStage(org.id, customer.id);
    expect(stage).not.toBeNull();
    expect(stage!.worstDaysOverdue).toBe(10);
    expect(stage!.currentStep?.actionLabel).toBe("1º contato de atraso"); // D+3 é a última etapa <= 10
    expect(stage!.nextStep?.actionLabel).toBe("Contato firme + proposta de renegociação"); // D+15
  });

  it("usa a régua customizada do empreendimento quando configurada", async () => {
    const spe = await prisma.development.findFirstOrThrow({ where: { id: developmentId } });
    const customDevelopment = await createDevelopment(context, { speId: spe.speId, name: "Empreendimento Régua Custom", type: "RESIDENTIAL_BUILDING" });
    await upsertCollectionRule(context, customDevelopment.id, [
      { sequence: 1, offsetDays: 0, actionLabel: "Aviso no vencimento" },
      { sequence: 2, offsetDays: 20, actionLabel: "Cobrança única aos 20 dias" },
    ]);

    const { customer } = await setUpSignedContract("AG202", customDevelopment.id);
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contract: { customerId: customer.id } },
      include: { installments: true },
    });
    const parcela = portfolio.installments.find((i) => !i.isDownPayment)!;
    await prisma.installment.update({ where: { id: parcela.id }, data: { dueDate: daysAgo(25) } });

    const stage = await getCustomerCollectionStage(org.id, customer.id);
    expect(stage!.currentStep?.actionLabel).toBe("Cobrança única aos 20 dias");
    expect(stage!.nextStep).toBeNull();
  });

  it("considera a pior parcela do cliente entre várias em atraso", async () => {
    const { customer, contract } = await setUpSignedContract("AG203");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
    const parcelas = portfolio.installments.filter((i) => !i.isDownPayment).sort((a, b) => a.sequence - b.sequence);
    await prisma.installment.update({ where: { id: parcelas[0].id }, data: { dueDate: daysAgo(5) } });
    await prisma.installment.update({ where: { id: parcelas[1].id }, data: { dueDate: daysAgo(40) } });

    const stage = await getCustomerCollectionStage(org.id, customer.id);
    expect(stage!.worstDaysOverdue).toBe(40);
  });

  it("cliente sem parcelas em atraso não aparece na lista de estágios", async () => {
    const { customer } = await setUpSignedContract("AG204");
    const stages = await getOverdueCustomerStages(org.id);
    expect(stages.find((s) => s.customerId === customer.id)).toBeUndefined();
  });
});

describe("Histórico de cobrança", () => {
  it("registra e lista contatos em ordem cronológica decrescente", async () => {
    const { customer } = await setUpSignedContract("AG301");

    await logCollectionContact(context, customer.id, {
      occurredAt: daysAgo(5),
      channel: "Ligação",
      summary: "Cliente disse que paga até sexta",
      nextStepNote: "Conferir pagamento na sexta",
    });
    await logCollectionContact(context, customer.id, {
      occurredAt: daysAgo(1),
      channel: "WhatsApp",
      summary: "Cliente confirmou pagamento parcial",
    });

    const history = await listCollectionHistory(org.id, customer.id);
    expect(history).toHaveLength(2);
    expect(history[0].channel).toBe("WhatsApp"); // mais recente primeiro
    expect(history[1].nextStepNote).toBe("Conferir pagamento na sexta");
  });

  it("rejeita cliente de outra organização", async () => {
    const orgB = await prisma.organization.create({ data: { name: "Org B — Aging" } });
    try {
      const { customer } = await setUpSignedContract("AG302");
      const contextB: AccessContext = { userId: crypto.randomUUID(), organizationId: orgB.id, roleNames: [], permissions: new Set() };
      await expect(
        logCollectionContact(contextB, customer.id, { occurredAt: new Date(), channel: "Ligação", summary: "x" }),
      ).rejects.toThrow(/inválido/);
    } finally {
      await prisma.organization.deleteMany({ where: { id: orgB.id } });
    }
  });
});
