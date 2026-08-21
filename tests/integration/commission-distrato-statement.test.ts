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
import { createDistrato, signDistrato } from "@/server/contract-distratos";
import { upsertCommissionRule } from "@/server/commission-rules";
import { getCustomerFinancialPosition } from "@/server/customer-statement";

/**
 * docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Etapa 6 — caso de teste obrigatório
 * 6 (distrato: comissão externa fora do cálculo, interna descontada,
 * corretor não devolve nada) + a parte do caso 4 sobre invisibilidade no
 * portal do cliente.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Distrato e Extrato" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "distrato-extrato@teste.local", fullName: "Usuário Distrato" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Distrato e Extrato", document: "63265390000141", status: "ACTIVE",
    email: "spe-distrato-extrato@teste.local", phone: "62999990093",
  });
  const development = await createDevelopment(context, { speId: spe.id, name: "Empreendimento Distrato Extrato", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.payable.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.supplier.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.contractDistrato.deleteMany({ where: { organizationId: { in: orgIds } } });
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

describe("Caso 6 — distrato: externo fora do cálculo, interno descontado", () => {
  it("totalPaid exclui a fatia do corretor; corretor não devolve nada; interno descontado da devolução", async () => {
    const manager = await createBroker(context, { name: "Gerente Interno Distrato", role: "MANAGER" });
    await upsertCommissionRule(context, developmentId, {
      externalCommissionPercent: 25, internalCommissionPercent: 2, internalCommissionAppliesTo: "ALL_SALES", internalManagerBrokerId: manager.id,
    });
    const broker = await createBroker(context, { name: "Corretor Distrato" });

    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "DIST-1", referenceValue: 200000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente Distrato", document: "55566677788" });
    const salesTable = await createSalesTable(context, { developmentId, name: "Tabela Distrato", downPaymentPercent: 20, monthlyInstallments: 5 });
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
    const entrada = portfolio.installments[0]; // 40.000, totalmente destinada ao corretor (comissão total 50.000)
    expect(Number(entrada.externalCommissionPortion)).toBe(40000);

    // Cliente paga só a entrada — 100% dela vai pro corretor, nada pra SPE.
    await registerInstallmentPayment(context, entrada.id, { amount: 40000, paidAt: new Date() });

    // --- Extrato do cliente: entrada 100%-corretor não aparece ---
    const position = await getCustomerFinancialPosition(context, customer.id);
    const contractStatement = position!.contracts.find((c) => c.contractId === contract.id)!;
    expect(contractStatement.installments.some((i) => i.id === entrada.id)).toBe(false);
    expect(contractStatement.totalPaid).toBe(0); // os 40.000 pagos foram todos pro corretor, zero pra SPE

    // --- Distrato ---
    const distrato = await createDistrato(context, contract.id, { refundDueDate: new Date() });
    expect(Number(distrato.totalPaid)).toBe(0); // não conta o que já foi pro corretor
    expect(Number(distrato.brokerageDeductionAmount)).toBe(800); // auto-derivado: 2% de 40.000 já acumulado

    const signed = await signDistrato(context, distrato.id);
    expect(Number(signed.refundAmount)).toBe(0); // nada a devolver (totalPaid líquido já é 0)

    // Comissão EXTERNA do corretor: nada devolvido, split intocado.
    const [externalSplit] = await prisma.externalCommissionSplit.findMany({ where: { saleId: sale.id } });
    expect(Number(externalSplit.paidAmount)).toBe(40000);
    expect(externalSplit.status).not.toBe("CANCELLED");

    // Comissão INTERNA: o que já foi acumulado (dinheiro que o cliente já
    // pagou) não é estornado — split continua com o mesmo accruedAmount.
    const internalSplit = await prisma.commissionSplit.findFirst({ where: { saleId: sale.id, beneficiaryType: "MANAGER" } });
    expect(Number(internalSplit!.accruedAmount)).toBe(800);
    expect(internalSplit!.status).not.toBe("CANCELLED");
  });
});
