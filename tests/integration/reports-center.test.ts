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
import { getReportData } from "@/server/reports-center";

/**
 * docs/ESPEC_FASE_C_DASHBOARD_EMPREENDIMENTOS.md, Etapa 5 — central de
 * relatórios. Cobre alguns relatórios representativos (venda com canal/
 * desconto, recebimentos do período, mapa de vendas) + isolamento por
 * organização, sem repetir o que já é testado nos motores de origem
 * (comissão, permuta, aportes já têm suíte própria).
 */

let org: { id: string };
let otherOrg: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Central de Relatórios" } });
  otherOrg = await prisma.organization.create({ data: { name: "Org — Central de Relatórios (outra)" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "central-relatorios@teste.local", fullName: "Usuário Central Relatórios" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Central Relatórios", document: "63265390001557", status: "ACTIVE",
    email: "spe-central-relatorios@teste.local", phone: "62999990780",
  });
  const development = await createDevelopment(context, { speId: spe.id, name: "Empreendimento Central Relatórios", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;

  const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "REL-1", referenceValue: 200000 });
  const broker = await createBroker(context, { name: "Corretor Central Relatórios" });
  const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente Central Relatórios", document: "11122233344" });
  const salesTable = await createSalesTable(context, { developmentId, name: "Tabela Central Relatórios", downPaymentPercent: 20, monthlyInstallments: 5 });
  const proposal = await createProposal(context, {
    developmentId, unitId: unit.id, customerId: customer.id, salesTableId: salesTable.id, brokerId: broker.id, discountPercent: 5,
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
  await registerInstallmentPayment(context, portfolio.installments[0].id, {
    amount: Number(portfolio.installments[0].originalValue),
    paidAt: new Date(),
  });
});

afterAll(async () => {
  const orgIds = [org.id, otherOrg.id];
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

describe("getReportData", () => {
  it("sales-map: lista todas as unidades com status e valor", async () => {
    const report = await getReportData(context, "sales-map", {});
    expect(report.rows.some((r) => r.unit === "REL-1")).toBe(true);
  });

  it("sales-period: traz canal, tabela e desconto da venda", async () => {
    const report = await getReportData(context, "sales-period", {});
    const row = report.rows.find((r) => r.unit === "REL-1")!;
    expect(row.channel).toBe("Corretor Central Relatórios");
    expect(row.table).toBe("Tabela Central Relatórios");
    expect(row.discount).toBe(5);
  });

  it("receipts-period: traz o recebimento registrado", async () => {
    const report = await getReportData(context, "receipts-period", {});
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].customer).toBe("Cliente Central Relatórios");
  });

  it("filtro por empreendimento restringe corretamente", async () => {
    const report = await getReportData(context, "sales-map", { developmentId: "00000000-0000-0000-0000-000000000000" });
    expect(report.rows).toHaveLength(0);
  });

  it("isolamento por organização", async () => {
    const otherContext: AccessContext = { ...context, organizationId: otherOrg.id };
    const report = await getReportData(otherContext, "sales-period", {});
    expect(report.rows).toHaveLength(0);
  });
});
