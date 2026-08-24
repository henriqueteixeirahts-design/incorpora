import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { createUnit } from "@/server/units";
import { createCustomer } from "@/server/customers";
import { createBroker } from "@/server/crm";
import { createSalesTable } from "@/server/sales-tables";
import { createProposal, submitProposalForApproval } from "@/server/proposals";
import { convertProposalToSale } from "@/server/sales";
import { createContract, markAwaitingSignature, confirmSignature } from "@/server/contracts";
import { registerInstallmentPayment } from "@/server/receivables";
import { createPermutante } from "@/server/permutantes";
import { createExchangeContract } from "@/server/exchange-contracts";
import { upsertExchangeFinancialTerms } from "@/server/exchange-financial-terms";
import { listApurationPeriods, closeExchangeApurationPeriod, listExchangeRepasses } from "@/server/exchange-repasse";

/**
 * docs/ESPEC_PERMUTANTES.md, Etapa 4 — motor de apuração da permuta
 * financeira. Base sempre "recebido" (regime caixa). Casos conferidos na
 * mão, rigor Sprint 6-7.
 */

let org: { id: string };
let otherOrg: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;

const CUSTOMER_DOCUMENTS = ["11122233344", "55566677788", "98765432100", "44455566677", "93541134780"];
let customerIndex = 0;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Repasse Financeira" } });
  otherOrg = await prisma.organization.create({ data: { name: "Org — Repasse Financeira (outra)" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "repasse-financeira@teste.local", fullName: "Usuário Repasse Financeira" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Repasse Financeira", document: "63265390001071", status: "ACTIVE",
    email: "spe-repasse-financeira@teste.local", phone: "62999990720",
  });
  const development = await createDevelopment(context, { speId: spe.id, name: "Empreendimento Repasse Financeira", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;
});

afterAll(async () => {
  const orgIds = [org.id, otherOrg.id];
  await prisma.exchangeRetentionRelease.deleteMany({ where: { exchangeContract: { development: { organizationId: { in: orgIds } } } } });
  await prisma.exchangeRepasse.deleteMany({ where: { exchangeContract: { development: { organizationId: { in: orgIds } } } } });
  await prisma.exchangeApurationPeriod.deleteMany({ where: { exchangeContract: { development: { organizationId: { in: orgIds } } } } });
  await prisma.exchangeContractFinancialUnit.deleteMany({ where: { financialTerms: { exchangeContract: { development: { organizationId: { in: orgIds } } } } } });
  await prisma.exchangeContractFinancialTerms.deleteMany({ where: { exchangeContract: { development: { organizationId: { in: orgIds } } } } });
  await prisma.exchangeContract.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.permutante.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.payable.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.supplier.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.installmentPayment.deleteMany({ where: { installment: { portfolio: { organizationId: { in: orgIds } } } } });
  await prisma.installment.deleteMany({ where: { portfolio: { organizationId: { in: orgIds } } } });
  await prisma.receivablePortfolio.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.externalCommissionSplit.deleteMany({ where: { sale: { organizationId: { in: orgIds } } } });
  await prisma.commissionSplit.deleteMany({ where: { sale: { organizationId: { in: orgIds } } } });
  await prisma.contract.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.sale.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.proposal.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.salesTable.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.broker.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

async function buildSaleOnUnit(unitId: string, label: string) {
  const broker = await createBroker(context, { name: `Corretor ${label}` });
  const document = CUSTOMER_DOCUMENTS[customerIndex++ % CUSTOMER_DOCUMENTS.length];
  const customer = await createCustomer(context, { type: "INDIVIDUAL", name: `Cliente ${label}`, document });
  const salesTable = await createSalesTable(context, {
    developmentId, name: `Tabela ${label}`, downPaymentPercent: 20, monthlyInstallments: 5,
  });
  const proposal = await createProposal(context, {
    developmentId, unitId, customerId: customer.id, salesTableId: salesTable.id, brokerId: broker.id, discountPercent: 0,
  });
  await submitProposalForApproval(context, proposal.id);
  const sale = await convertProposalToSale(context, proposal.id);
  const contract = await createContract(context, sale.id);
  await markAwaitingSignature(context, contract.id);
  await confirmSignature(context, contract.id);

  const portfolio = (await prisma.receivablePortfolio.findUnique({
    where: { contractId: contract.id },
    include: { installments: { orderBy: { sequence: "asc" } } },
  }))!;
  return { sale, contract, portfolio };
}

describe("Motor de apuração da permuta financeira — fluxo MONTHLY_CONSOLIDATED", () => {
  it("acumula eventos no período aberto e só gera Payable no fechamento manual, com dedução de comissão informada", async () => {
    const permutante = await createPermutante(context, { type: "INDIVIDUAL", name: "Permutante Financeira A", document: "02654427102" });
    const exchangeContract = await createExchangeContract(context, {
      developmentId, permutanteId: permutante.id, type: "FINANCIAL", contractDate: new Date(), landIds: [],
    });
    await upsertExchangeFinancialTerms(context, exchangeContract.id, {
      percent: 15, incidenceScope: "ALL_UNITS", payoutFlow: "MONTHLY_CONSOLIDATED",
      deductionBase: "NET", deductCommission: true, retentionPct: 10,
    });

    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "FIN-1", referenceValue: 200000 });
    const { portfolio } = await buildSaleOnUnit(unit.id, "FIN-1");
    const entrada = portfolio.installments[0];
    await registerInstallmentPayment(context, entrada.id, { amount: Number(entrada.originalValue), paidAt: new Date() });

    const repasses = await listExchangeRepasses(context, exchangeContract.id);
    expect(repasses).toHaveLength(1);
    expect(repasses[0].payableId).toBeNull(); // ainda não fechou o período

    const periods = await listApurationPeriods(context, exchangeContract.id);
    expect(periods).toHaveLength(1);
    expect(periods[0].status).toBe("OPEN");
    const periodId = periods[0].id;

    // dedução habilitada mas não informada -> rejeita o fechamento
    await expect(closeExchangeApurationPeriod(context, periodId, {})).rejects.toThrow(/Informe o valor de comissão/);

    // administrationFeePct não configurado no contrato (null) -> adminFee = 0
    // entrada = 40.000 (20% de 200.000); base líquida (sem admin fee) = 40.000
    // share bruto = 40.000 * 15% = 6.000
    // fechamento: comissão informada 500 -> líquido = 5.500; retenção 10% = 550 -> net = 4.950
    const closed = await closeExchangeApurationPeriod(context, periodId, { commissionDeduction: 500 });
    expect(Number(closed.netAmount)).toBe(4950);
    expect(Number(closed.retainedAmount)).toBe(550);
    expect(closed.status).toBe("CLOSED");

    const payable = await prisma.payable.findUnique({ where: { id: closed.payableId! } });
    expect(payable?.category).toBe("EXCHANGE_REPASSE");
    expect(Number(payable?.amount)).toBe(4950);

    await expect(closeExchangeApurationPeriod(context, periodId, { commissionDeduction: 500 })).rejects.toThrow(/já foi fechado/);
  });
});

describe("Motor de apuração da permuta financeira — fluxo ON_RECEIPT sem dedução manual", () => {
  it("fecha cada evento na hora (sem período), aplicando só retenção", async () => {
    const permutante = await createPermutante(context, { type: "INDIVIDUAL", name: "Permutante Financeira B", document: "11144477735" });
    const exchangeContract = await createExchangeContract(context, {
      developmentId, permutanteId: permutante.id, type: "FINANCIAL", contractDate: new Date(), landIds: [],
    });
    await upsertExchangeFinancialTerms(context, exchangeContract.id, {
      percent: 10, incidenceScope: "ALL_UNITS", payoutFlow: "ON_RECEIPT",
      deductionBase: "GROSS", retentionPct: 20,
    });

    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "FIN-2", referenceValue: 100000 });
    const { portfolio } = await buildSaleOnUnit(unit.id, "FIN-2");
    const entrada = portfolio.installments[0];
    // entrada = 20.000 (20% de 100.000); share bruto = 20.000 * 10% = 2.000
    // retenção 20% = 400 -> net = 1.600, pago na hora
    await registerInstallmentPayment(context, entrada.id, { amount: Number(entrada.originalValue), paidAt: new Date() });

    const repasses = await listExchangeRepasses(context, exchangeContract.id);
    expect(repasses).toHaveLength(1);
    expect(repasses[0].payableId).not.toBeNull();

    const payable = await prisma.payable.findUnique({ where: { id: repasses[0].payableId! } });
    expect(Number(payable?.amount)).toBe(1600);

    const periods = await listApurationPeriods(context, exchangeContract.id);
    expect(periods).toHaveLength(0); // não passou por período — fechou direto
  });
});

describe("Motor de apuração da permuta financeira — incidência VALUE_CAP", () => {
  it("o evento que atingiria o teto absorve só o restante; depois disso não gera mais nada", async () => {
    const permutante = await createPermutante(context, { type: "INDIVIDUAL", name: "Permutante Financeira C", document: "93541134780" });
    const exchangeContract = await createExchangeContract(context, {
      developmentId, permutanteId: permutante.id, type: "FINANCIAL", contractDate: new Date(), landIds: [],
    });
    await upsertExchangeFinancialTerms(context, exchangeContract.id, {
      percent: 50, incidenceScope: "VALUE_CAP", incidenceCapValue: 3000, payoutFlow: "ON_RECEIPT", deductionBase: "GROSS",
    });

    const unitA = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "FIN-3A", referenceValue: 50000 });
    const { portfolio: portfolioA } = await buildSaleOnUnit(unitA.id, "FIN-3A");
    // entrada A = 10.000 (20% de 50.000); share bruto = 10.000*50% = 5.000 > teto 3.000 -> capped a 3.000
    await registerInstallmentPayment(context, portfolioA.installments[0].id, { amount: Number(portfolioA.installments[0].originalValue), paidAt: new Date() });

    const unitB = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "FIN-3B", referenceValue: 50000 });
    const { portfolio: portfolioB } = await buildSaleOnUnit(unitB.id, "FIN-3B");
    await registerInstallmentPayment(context, portfolioB.installments[0].id, { amount: Number(portfolioB.installments[0].originalValue), paidAt: new Date() });

    const repasses = await listExchangeRepasses(context, exchangeContract.id);
    expect(repasses).toHaveLength(1); // segundo evento gerou share=0, não cria linha
    expect(Number(repasses[0].share)).toBe(3000);
  });
});

describe("isolamento por organização", () => {
  it("período de apuração de uma org não é acessível pra outra", async () => {
    const permutante = await createPermutante(context, { type: "INDIVIDUAL", name: "Permutante Financeira D", document: "72165490607" });
    const exchangeContract = await createExchangeContract(context, {
      developmentId, permutanteId: permutante.id, type: "FINANCIAL", contractDate: new Date(), landIds: [],
    });
    await upsertExchangeFinancialTerms(context, exchangeContract.id, {
      percent: 10, incidenceScope: "ALL_UNITS", payoutFlow: "MONTHLY_CONSOLIDATED", deductionBase: "GROSS",
    });

    const otherContext: AccessContext = { ...context, organizationId: otherOrg.id };
    await expect(listApurationPeriods(otherContext, exchangeContract.id)).rejects.toThrow("Contrato de permuta não encontrado.");
  });
});
