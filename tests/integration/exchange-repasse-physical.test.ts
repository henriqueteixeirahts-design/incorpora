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
import { upsertCommissionRule } from "@/server/commission-rules";
import { createPermutante } from "@/server/permutantes";
import { createExchangeContract, destacarUnidade } from "@/server/exchange-contracts";
import { listExchangeRepasses, getExchangeRetentionBalance, releaseExchangeRetention } from "@/server/exchange-repasse";

/**
 * docs/ESPEC_PERMUTANTES.md, Etapa 3 — repasse de permuta física sob gestão.
 * A unidade destacada continua no funil normal de vendas (managedBySystem =
 * true); o pagamento do cliente gera repasse = recebido − corretagem
 * (externa + interna, reaproveitadas do motor de Comissionamento) − taxa de
 * administração − retenção. Caso conferido na mão, rigor Sprint 6-7.
 */

let org: { id: string };
let otherOrg: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Repasse Física" } });
  otherOrg = await prisma.organization.create({ data: { name: "Org — Repasse Física (outra)" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "repasse-fisica@teste.local", fullName: "Usuário Repasse Física" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Repasse Física", document: "63265390000998", status: "ACTIVE",
    email: "spe-repasse-fisica@teste.local", phone: "62999990710",
  });
  const development = await createDevelopment(context, { speId: spe.id, name: "Empreendimento Repasse Física", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;

  const manager = await createBroker(context, { name: "Gerente Interno Repasse Física", role: "MANAGER" });
  await upsertCommissionRule(context, developmentId, {
    externalCommissionPercent: 25, internalCommissionPercent: 2, internalCommissionAppliesTo: "ALL_SALES", internalManagerBrokerId: manager.id,
  });
});

afterAll(async () => {
  const orgIds = [org.id, otherOrg.id];
  await prisma.exchangeRetentionRelease.deleteMany({ where: { exchangeContract: { development: { organizationId: { in: orgIds } } } } });
  await prisma.exchangeRepasse.deleteMany({ where: { exchangeContract: { development: { organizationId: { in: orgIds } } } } });
  await prisma.exchangeContract.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.permutante.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.commissionSplitPayable.deleteMany({ where: { split: { sale: { organizationId: { in: orgIds } } } } });
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
  await prisma.commissionRule.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

const CUSTOMER_DOCUMENTS: Record<string, string> = {
  "PF-1": "11122233344",
  "PF-3": "55566677788",
  "PF-4": "93541134780",
};

async function buildSaleOnUnit(unitId: string, unitNumber: string) {
  const broker = await createBroker(context, { name: `Corretor ${unitNumber}` });
  const customer = await createCustomer(context, {
    type: "INDIVIDUAL",
    name: `Cliente ${unitNumber}`,
    document: CUSTOMER_DOCUMENTS[unitNumber] ?? "11122233344",
  });
  const salesTable = await createSalesTable(context, {
    developmentId, name: `Tabela ${unitNumber}`, downPaymentPercent: 20, monthlyInstallments: 5,
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

describe("Repasse de permuta física sob gestão", () => {
  it("pagamento gera repasse = recebido − corretagem externa − corretagem interna − taxa de administração − retenção", async () => {
    const permutante = await createPermutante(context, { type: "INDIVIDUAL", name: "Permutante Física", document: "02654427102" });
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "PF-1", referenceValue: 200000 });
    const exchangeContract = await createExchangeContract(context, {
      developmentId, permutanteId: permutante.id, type: "PHYSICAL", contractDate: new Date(),
      managedBySystem: true, administrationFeePct: 5, retentionPct: 10, landIds: [],
    });
    await destacarUnidade(context, exchangeContract.id, unit.id);

    const { sale, portfolio } = await buildSaleOnUnit(unit.id, "PF-1");
    const boundary = portfolio.installments[1]; // parcela mensal 32.000, fronteira parcial (10.000 de portion)
    expect(Number(boundary.originalValue)).toBe(32000);
    expect(Number(boundary.externalCommissionPortion)).toBe(10000);

    // Paga a parcela-fronteira de uma vez: 32.000 recebido.
    // externo reconhecido = 10.000 (teto do portion); interno = 2% de 32.000 = 640.
    // afterCommissions = 32000 - 10000 - 640 = 21.360
    // taxa adm 5% = 1.068 -> afterAdminFee = 20.292
    // retenção 10% = 2.029,20 -> share = 18.262,80
    await registerInstallmentPayment(context, boundary.id, { amount: 32000, paidAt: new Date() });

    const repasses = await listExchangeRepasses(context, exchangeContract.id);
    expect(repasses).toHaveLength(1);
    const repasse = repasses[0];
    expect(Number(repasse.grossBase)).toBe(32000);
    expect(Number(repasse.externalCommissionAmount)).toBe(10000);
    expect(Number(repasse.internalCommissionAmount)).toBe(640);
    expect(Number(repasse.administrationFeeAmount)).toBe(1068);
    expect(Number(repasse.share)).toBe(18262.8);

    const payable = await prisma.payable.findUnique({ where: { id: repasse.payableId! } });
    expect(payable?.category).toBe("EXCHANGE_REPASSE");
    expect(Number(payable?.amount)).toBe(18262.8);
    expect(payable?.developmentId).toBe(developmentId);

    const supplier = await prisma.supplier.findFirst({ where: { permutanteId: permutante.id } });
    expect(supplier).not.toBeNull();
    expect(payable?.supplierId).toBe(supplier!.id);

    const retentionBalance = await getExchangeRetentionBalance(context, exchangeContract.id);
    expect(retentionBalance).toBe(2029.2);

    // Sale mantida como sanity check — não é receita da SPE, mas o objeto existe.
    expect(sale.id).toBeTruthy();
  });

  it("unidade fora de gestão (managedBySystem = false) sai do funil (status EXCHANGE) e nunca gera ExchangeRepasse", async () => {
    const permutante = await createPermutante(context, { type: "INDIVIDUAL", name: "Permutante Fora de Gestão", document: "11144477735" });
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "PF-2", referenceValue: 150000 });
    const exchangeContract = await createExchangeContract(context, {
      developmentId, permutanteId: permutante.id, type: "PHYSICAL", contractDate: new Date(),
      managedBySystem: false, landIds: [],
    });
    await destacarUnidade(context, exchangeContract.id, unit.id);

    const updated = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(updated.status).toBe("EXCHANGE");

    const repasses = await listExchangeRepasses(context, exchangeContract.id);
    expect(repasses).toHaveLength(0);
  });

  it("unidade sem contrato de permuta não gera nenhum ExchangeRepasse", async () => {
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "PF-3", referenceValue: 180000 });
    const { portfolio } = await buildSaleOnUnit(unit.id, "PF-3");
    const entrada = portfolio.installments[0];
    await registerInstallmentPayment(context, entrada.id, { amount: Number(entrada.originalValue), paidAt: new Date() });

    const payment = await prisma.installmentPayment.findFirstOrThrow({ where: { installmentId: entrada.id } });
    const linkedRepasse = await prisma.exchangeRepasse.findFirst({ where: { installmentPaymentId: payment.id } });
    expect(linkedRepasse).toBeNull();
  });

  it("liberação de retenção acima do saldo disponível é rejeitada; liberação válida reduz o saldo", async () => {
    const permutante = await createPermutante(context, { type: "INDIVIDUAL", name: "Permutante Retenção", document: "05283253023" });
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "PF-4", referenceValue: 100000 });
    const exchangeContract = await createExchangeContract(context, {
      developmentId, permutanteId: permutante.id, type: "PHYSICAL", contractDate: new Date(),
      managedBySystem: true, administrationFeePct: 0, retentionPct: 20, landIds: [],
    });
    await destacarUnidade(context, exchangeContract.id, unit.id);
    const { portfolio } = await buildSaleOnUnit(unit.id, "PF-4");
    // parcela-fronteira: só parte dela é corretagem externa, sobra base pra retenção
    // (a entrada, nesta tabela, é 100% consumida pela comissão externa — sem sobra).
    const boundary = portfolio.installments[1];
    await registerInstallmentPayment(context, boundary.id, { amount: Number(boundary.originalValue), paidAt: new Date() });

    const available = await getExchangeRetentionBalance(context, exchangeContract.id);
    expect(available).toBeGreaterThan(0);

    await expect(
      releaseExchangeRetention(context, exchangeContract.id, { amount: available + 1000, releaseDate: new Date() }),
    ).rejects.toThrow(/excede o saldo retido/);

    await releaseExchangeRetention(context, exchangeContract.id, { amount: available, releaseDate: new Date() });
    const afterRelease = await getExchangeRetentionBalance(context, exchangeContract.id);
    expect(afterRelease).toBe(0);
  });

  it("isolamento por organização", async () => {
    const permutante = await createPermutante(context, { type: "INDIVIDUAL", name: "Permutante Isolamento", document: "12345678909" });
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "PF-5", referenceValue: 90000 });
    const exchangeContract = await createExchangeContract(context, {
      developmentId, permutanteId: permutante.id, type: "PHYSICAL", contractDate: new Date(), managedBySystem: true, landIds: [],
    });
    await destacarUnidade(context, exchangeContract.id, unit.id);

    const otherContext: AccessContext = { ...context, organizationId: otherOrg.id };
    await expect(listExchangeRepasses(otherContext, exchangeContract.id)).rejects.toThrow("Contrato de permuta não encontrado.");
  });
});
