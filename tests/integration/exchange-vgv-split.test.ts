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
import { createPermutante } from "@/server/permutantes";
import { createExchangeContract, destacarUnidade } from "@/server/exchange-contracts";
import { getSalesSummary } from "@/server/reports";

/**
 * docs/ESPEC_PERMUTANTES.md, Etapa 6 — VGV separa receita própria de VGV
 * permutante: a unidade destacada sob gestão continua no funil normal
 * (gera Sale), mas essa venda nunca é receita da SPE.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — VGV Permuta" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "vgv-permuta@teste.local", fullName: "Usuário VGV Permuta" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE VGV Permuta", document: "63265390001233", status: "ACTIVE",
    email: "spe-vgv-permuta@teste.local", phone: "62999990740",
  });
  const development = await createDevelopment(context, { speId: spe.id, name: "Empreendimento VGV Permuta", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;
});

afterAll(async () => {
  await prisma.exchangeContract.deleteMany({ where: { development: { organizationId: org.id } } });
  await prisma.permutante.deleteMany({ where: { organizationId: org.id } });
  await prisma.contract.deleteMany({ where: { organizationId: org.id } });
  await prisma.sale.deleteMany({ where: { organizationId: org.id } });
  await prisma.proposal.deleteMany({ where: { organizationId: org.id } });
  await prisma.salesTable.deleteMany({ where: { development: { organizationId: org.id } } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: org.id } } });
  await prisma.customer.deleteMany({ where: { organizationId: org.id } });
  await prisma.broker.deleteMany({ where: { organizationId: org.id } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: org.id } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: org.id } });
  await prisma.development.deleteMany({ where: { organizationId: org.id } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: org.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: org.id } });
});

async function sellUnit(unitId: string, label: string, document: string) {
  const broker = await createBroker(context, { name: `Corretor ${label}` });
  const customer = await createCustomer(context, { type: "INDIVIDUAL", name: `Cliente ${label}`, document });
  const salesTable = await createSalesTable(context, { developmentId, name: `Tabela ${label}`, downPaymentPercent: 20, monthlyInstallments: 5 });
  const proposal = await createProposal(context, {
    developmentId, unitId, customerId: customer.id, salesTableId: salesTable.id, brokerId: broker.id, discountPercent: 0,
  });
  await submitProposalForApproval(context, proposal.id);
  return convertProposalToSale(context, proposal.id);
}

describe("getSalesSummary — VGV separa receita própria de VGV permutante", () => {
  it("venda de unidade normal soma em vgvSold; venda de unidade de permuta física sob gestão soma em vgvPermutante", async () => {
    const ownUnit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "VGV-1", referenceValue: 200000 });
    await sellUnit(ownUnit.id, "VGV-1", "11122233344");

    const permutante = await createPermutante(context, { type: "INDIVIDUAL", name: "Permutante VGV", document: "02654427102" });
    const exchangeUnit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "VGV-2", referenceValue: 150000 });
    const exchangeContract = await createExchangeContract(context, {
      developmentId, permutanteId: permutante.id, type: "PHYSICAL", contractDate: new Date(), managedBySystem: true, landIds: [],
    });
    await destacarUnidade(context, exchangeContract.id, exchangeUnit.id);
    await sellUnit(exchangeUnit.id, "VGV-2", "55566677788");

    const summary = await getSalesSummary(org.id, developmentId);
    expect(summary.vgvSold).toBe(200000);
    expect(summary.vgvPermutante).toBe(150000);
    expect(summary.unitsSold).toBe(1);
    expect(summary.unitsPermutante).toBe(1);
  });
});
