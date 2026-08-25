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
import { createPayable } from "@/server/payables";
import { getExecutiveDashboard } from "@/server/dashboard-executive";

/**
 * docs/ESPEC_FASE_C_DASHBOARD_EMPREENDIMENTOS.md, Etapa 3 — dashboard
 * executivo. Foco nos dois indicadores decididos com o usuário antes de
 * codar: VSO de período (vendas do período ÷ unidades do estoque × 100) e
 * exposição de caixa (ponto mais negativo do saldo acumulado projetado).
 */

let org: { id: string };
let otherOrg: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Dashboard Executivo" } });
  otherOrg = await prisma.organization.create({ data: { name: "Org — Dashboard Executivo (outra)" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "dashboard-executivo@teste.local", fullName: "Usuário Dashboard Executivo" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Dashboard Executivo", document: "63265390001476", status: "ACTIVE",
    email: "spe-dashboard-executivo@teste.local", phone: "62999990770",
  });
  const development = await createDevelopment(context, { speId: spe.id, name: "Empreendimento Dashboard Executivo", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;

  // 4 unidades no estoque, 1 vendida no período — VSO = 1/4*100 = 25%.
  for (let i = 1; i <= 4; i++) {
    await createUnit(context, { developmentId, unitType: "APARTMENT", number: `DE-${i}`, referenceValue: 100000 });
  }
  const [soldUnit] = await prisma.unit.findMany({ where: { developmentId }, orderBy: { number: "asc" }, take: 1 });
  const broker = await createBroker(context, { name: "Corretor Dashboard Executivo" });
  const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente Dashboard Executivo", document: "11122233344" });
  const salesTable = await createSalesTable(context, { developmentId, name: "Tabela Dashboard Executivo", downPaymentPercent: 20, monthlyInstallments: 5 });
  const proposal = await createProposal(context, {
    developmentId, unitId: soldUnit.id, customerId: customer.id, salesTableId: salesTable.id, brokerId: broker.id, discountPercent: 0,
  });
  await submitProposalForApproval(context, proposal.id);
  await convertProposalToSale(context, proposal.id);

  // Conta a pagar grande, vencendo em breve — cria exposição de caixa negativa.
  await createPayable(context, {
    developmentId,
    category: "CONSTRUCTION",
    description: "Medição de obra",
    competenceDate: new Date(),
    dueDate: new Date(Date.now() + 5 * 86400000),
    amount: 500000,
  });
});

afterAll(async () => {
  const orgIds = [org.id, otherOrg.id];
  await prisma.payable.deleteMany({ where: { organizationId: { in: orgIds } } });
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

describe("getExecutiveDashboard", () => {
  it("VSO de período = vendas do período / unidades do estoque × 100", async () => {
    const now = new Date();
    const dashboard = await getExecutiveDashboard(context, {
      developmentId,
      period: { dateFrom: new Date(now.getFullYear(), now.getMonth(), 1), dateTo: new Date(now.getFullYear(), now.getMonth() + 1, 0) },
    });
    expect(dashboard.comercial.salesInPeriodCount).toBe(1);
    expect(dashboard.comercial.vso).toBe(25);
  });

  it("exposição de caixa é o ponto mais negativo do saldo acumulado projetado", async () => {
    const now = new Date();
    const dashboard = await getExecutiveDashboard(context, {
      period: { dateFrom: new Date(now.getFullYear(), now.getMonth(), 1), dateTo: new Date(now.getFullYear(), now.getMonth() + 1, 0) },
    });
    const row = dashboard.financeiro.resultadoPorEmpreendimento.find((r) => r.developmentId === developmentId)!;
    // sem saldo inicial (includeOpeningBalance: false) e uma conta de 500.000 vencendo em breve
    // sem contrapartida de recebimento equivalente -> saldo acumulado fica bem negativo.
    expect(row.exposicao).toBeLessThan(0);
    expect(Math.abs(row.exposicao)).toBeGreaterThanOrEqual(500000 * 0.9); // tolerância pra outras entradas/saídas do teste
  });

  it("isolamento por organização", async () => {
    const otherContext: AccessContext = { ...context, organizationId: otherOrg.id };
    const now = new Date();
    await expect(
      getExecutiveDashboard(otherContext, {
        developmentId,
        period: { dateFrom: now, dateTo: now },
      }),
    ).rejects.toThrow("Empreendimento inválido.");
  });
});
