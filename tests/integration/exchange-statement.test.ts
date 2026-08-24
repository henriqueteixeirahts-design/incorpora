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
import { getExchangeStatement } from "@/server/exchange-statement";

/**
 * docs/ESPEC_PERMUTANTES.md, Etapa 5 — extrato do permutante: resumo +
 * linha do tempo cronológica dos repasses já gerados pelas etapas 3-4.
 */

let org: { id: string };
let otherOrg: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Extrato Permutante" } });
  otherOrg = await prisma.organization.create({ data: { name: "Org — Extrato Permutante (outra)" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "extrato-permutante@teste.local", fullName: "Usuário Extrato Permutante" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Extrato Permutante", document: "63265390001152", status: "ACTIVE",
    email: "spe-extrato-permutante@teste.local", phone: "62999990730",
  });
  const development = await createDevelopment(context, { speId: spe.id, name: "Empreendimento Extrato Permutante", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;

  await upsertCommissionRule(context, developmentId, {
    externalCommissionPercent: 25, internalCommissionPercent: 0, internalCommissionAppliesTo: "ALL_SALES", internalManagerBrokerId: null,
  });
});

afterAll(async () => {
  const orgIds = [org.id, otherOrg.id];
  await prisma.exchangeRetentionRelease.deleteMany({ where: { exchangeContract: { development: { organizationId: { in: orgIds } } } } });
  await prisma.exchangeRepasse.deleteMany({ where: { exchangeContract: { development: { organizationId: { in: orgIds } } } } });
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
  await prisma.commissionRule.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("getExchangeStatement", () => {
  it("resumo e linha do tempo refletem os repasses já gerados pela etapa 3", async () => {
    const permutante = await createPermutante(context, { type: "INDIVIDUAL", name: "Permutante Extrato", document: "02654427102" });
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "EXT-1", referenceValue: 100000 });
    const exchangeContract = await createExchangeContract(context, {
      developmentId, permutanteId: permutante.id, type: "PHYSICAL", contractDate: new Date(),
      managedBySystem: true, administrationFeePct: 5, retentionPct: 10, landIds: [],
    });
    await destacarUnidade(context, exchangeContract.id, unit.id);

    const broker = await createBroker(context, { name: "Corretor Extrato" });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente Extrato", document: "11122233344" });
    const salesTable = await createSalesTable(context, { developmentId, name: "Tabela Extrato", downPaymentPercent: 20, monthlyInstallments: 5 });
    const proposal = await createProposal(context, {
      developmentId, unitId: unit.id, customerId: customer.id, salesTableId: salesTable.id, brokerId: broker.id, discountPercent: 0,
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
    const boundary = portfolio.installments[1]; // parcela fronteira, tem sobra de base após a corretagem
    await registerInstallmentPayment(context, boundary.id, { amount: Number(boundary.originalValue), paidAt: new Date() });

    const statement = await getExchangeStatement(context, exchangeContract.id);
    expect(statement.contract.permutanteName).toBe("Permutante Extrato");
    expect(statement.contract.unitCount).toBe(1);
    expect(statement.summary.totalRepassed).toBeGreaterThan(0);
    expect(statement.summary.retentionBalance).toBeGreaterThan(0);
    expect(statement.events).toHaveLength(1);
    expect(statement.events[0].kind).toBe("REPASSE");
    expect(statement.events[0].statusLabel).toBe("Repassado");
  });

  it("isolamento por organização", async () => {
    const permutante = await createPermutante(context, { type: "INDIVIDUAL", name: "Permutante Extrato Isolamento", document: "55566677788" });
    const exchangeContract = await createExchangeContract(context, {
      developmentId, permutanteId: permutante.id, type: "PHYSICAL", contractDate: new Date(), managedBySystem: true, landIds: [],
    });

    const otherContext: AccessContext = { ...context, organizationId: otherOrg.id };
    await expect(getExchangeStatement(otherContext, exchangeContract.id)).rejects.toThrow("Contrato de permuta não encontrado.");
  });
});
