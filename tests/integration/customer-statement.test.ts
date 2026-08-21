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
import { registerInstallmentPayment, simulateFullSettlement } from "@/server/receivables";
import { createAmendment, signAmendment } from "@/server/contract-amendments";
import { createDistrato, signDistrato } from "@/server/contract-distratos";
import { getCustomerFinancialPosition } from "@/server/customer-statement";

/**
 * Fase B, etapa 1 (docs/ESPEC_FASE_B_CARTEIRA_FINANCEIRO_1.md, Parte 1) —
 * extrato do cliente: posição financeira ao vivo, reaproveitando o motor
 * de correção já existente (índice + juros de duas fases, multa/mora),
 * sem persistir nenhum recálculo novo (é exibição, não gravação). Rigor
 * centavo a centavo pedido pelo usuário — sem índice configurado, o fator
 * de correção fica em 1 (nenhum mês faltante trava o cálculo, só zera a
 * taxa), então o valor corrigido de uma parcela em dia é sempre igual ao
 * nominal; só multa/mora entram quando a parcela está vencida.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;
let customerSeq = 0;

function nextDocument() {
  customerSeq += 1;
  return `7${String(customerSeq).padStart(10, "0")}`;
}

async function setUpSignedContract(unitNumber: string, customerId?: string) {
  const unit = await createUnit(context, {
    developmentId,
    unitType: "APARTMENT",
    number: unitNumber,
    referenceValue: 200000,
  });
  const customer =
    customerId != null
      ? await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })
      : await createCustomer(context, { type: "INDIVIDUAL", name: `Cliente ${unitNumber}`, document: nextDocument() });
  const salesTable = await createSalesTable(context, {
    developmentId,
    name: `Tabela ${unitNumber}`,
    downPaymentPercent: 20,
    monthlyInstallments: 4,
  });
  const proposal = await createProposal(context, {
    developmentId,
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
  org = await prisma.organization.create({ data: { name: "Org — Extrato" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "extrato@teste.local", fullName: "Usuário Extrato" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Extrato",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-extrato@teste.local",
    phone: "62999990100",
  });
  const development = await createDevelopment(context, {
    speId: spe.id,
    name: "Empreendimento Extrato",
    type: "RESIDENTIAL_BUILDING",
  });
  developmentId = development.id;
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.contractDistrato.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.contractAmendment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.payable.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.supplier.deleteMany({ where: { organizationId: { in: orgIds } } });
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

describe("Posição financeira — rigor centavo a centavo (multa/mora)", () => {
  it("total pago, saldo devedor e % quitado batem com cálculo manual, incluindo multa/mora da parcela vencida", async () => {
    const { contract, customer } = await setUpSignedContract("EX101");

    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    const entrada = portfolio.installments.find((i) => i.isDownPayment)!;
    const parcelas = portfolio.installments.filter((i) => !i.isDownPayment).sort((a, b) => a.sequence - b.sequence);

    // Entrada e 1a parcela pagas em dia (sem índice cadastrado, corrigido = nominal).
    await registerInstallmentPayment(context, entrada.id, { amount: 40000, paidAt: new Date() });
    await registerInstallmentPayment(context, parcelas[0].id, { amount: 40000, paidAt: new Date() });

    // 2a parcela vencida há exatamente 30 dias na data de referência do extrato.
    const asOfDate = new Date("2026-06-30");
    const dueDate = new Date("2026-05-31");
    await prisma.installment.update({ where: { id: parcelas[1].id }, data: { dueDate } });

    const position = await getCustomerFinancialPosition(context, customer.id, asOfDate);
    expect(position).not.toBeNull();
    expect(position!.contracts).toHaveLength(1);

    const c = position!.contracts[0];
    expect(c.contractNumber).toBe(contract.contractNumber);
    expect(c.contractedValue).toBe(200000);
    expect(c.totalPaid).toBe(80000); // 40000 + 40000
    expect(c.percentPaid).toBe(40);
    expect(c.situationLabel).toBe("Em atraso");

    const parcela2Row = c.installments.find((i) => i.id === parcelas[1].id)!;
    expect(parcela2Row.daysOverdue).toBe(30);
    // multa 2% sobre 40000 = 800; mora 1%/mês * 30/30 dias = 400. resultValue = 40000+800+400 = 41200.
    expect(parcela2Row.fineAmount).toBe(800);
    expect(parcela2Row.overdueInterestAmount).toBe(400);
    expect(parcela2Row.resultValue).toBe(41200);
    expect(parcela2Row.situationLabel).toBe("Vencida");

    const parcela3Row = c.installments.find((i) => i.id === parcelas[2].id)!;
    const parcela4Row = c.installments.find((i) => i.id === parcelas[3].id)!;
    expect(parcela3Row.resultValue).toBe(40000);
    expect(parcela4Row.resultValue).toBe(40000);

    // Saldo devedor = 41200 (vencida) + 40000 + 40000 = 121200.
    expect(c.outstandingBalance).toBe(121200);

    // Parcelas pagas mostram o valor congelado no momento do pagamento, não recalculado pra hoje.
    const entradaRow = c.installments.find((i) => i.id === entrada.id)!;
    expect(entradaRow.resultValue).toBe(40000);
    expect(entradaRow.payments).toHaveLength(1);
    expect(entradaRow.payments[0].amount).toBe(40000);

    // Consolidado bate com o único contrato (mesmo cliente, um contrato só até aqui).
    expect(position!.consolidated.totalPaid).toBe(80000);
    expect(position!.consolidated.outstandingBalance).toBe(121200);
    expect(position!.consolidated.situationLabel).toBe("Em atraso");
  });

  it("simulateFullSettlement bate exatamente com o saldo devedor do extrato na mesma data", async () => {
    const { contract, customer } = await setUpSignedContract("EX102");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    const entrada = portfolio.installments.find((i) => i.isDownPayment)!;
    await registerInstallmentPayment(context, entrada.id, { amount: 40000, paidAt: new Date() });

    const asOfDate = new Date("2026-08-01");
    const position = await getCustomerFinancialPosition(context, customer.id, asOfDate);
    const settlement = await simulateFullSettlement(context, contract.id, asOfDate);

    expect(settlement.total).toBe(position!.contracts[0].outstandingBalance);
  });
});

describe("Situação do contrato", () => {
  it("Quitado quando não há mais exposição em aberto", async () => {
    const { contract, customer } = await setUpSignedContract("EX201");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    for (const installment of portfolio.installments) {
      await registerInstallmentPayment(context, installment.id, { amount: Number(installment.originalValue), paidAt: new Date() });
    }

    const position = await getCustomerFinancialPosition(context, customer.id);
    expect(position!.contracts[0].situationLabel).toBe("Quitado");
    expect(position!.contracts[0].outstandingBalance).toBe(0);
  });

  it("Renegociado quando há aditivo de renegociação de fluxo assinado, e a parcela substituída aparece como Renegociada", async () => {
    const { contract, customer } = await setUpSignedContract("EX202");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    const entrada = portfolio.installments.find((i) => i.isDownPayment)!;
    await registerInstallmentPayment(context, entrada.id, { amount: 40000, paidAt: new Date() });

    const amendment = await createAmendment(context, contract.id, { type: "FLOW_RENEGOTIATION", monthlyInstallments: 2 });
    await signAmendment(context, amendment.id);

    const position = await getCustomerFinancialPosition(context, customer.id);
    const c = position!.contracts[0];
    expect(c.situationLabel).toBe("Renegociado");

    const cancelledRow = c.installments.find((i) => i.status === "CANCELLED" && i.renegotiatedByAmendmentNumber);
    expect(cancelledRow).toBeDefined();
    expect(cancelledRow!.situationLabel).toBe("Renegociada");
    expect(cancelledRow!.renegotiatedByAmendmentNumber).toBe(amendment.amendmentNumber);
  });

  it("Distratado quando o distrato foi assinado", async () => {
    const { contract, customer } = await setUpSignedContract("EX203");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    const entrada = portfolio.installments.find((i) => i.isDownPayment)!;
    await registerInstallmentPayment(context, entrada.id, { amount: 40000, paidAt: new Date() });

    const distrato = await createDistrato(context, contract.id, { refundDueDate: new Date() });
    await signDistrato(context, distrato.id);

    const position = await getCustomerFinancialPosition(context, customer.id);
    const c = position!.contracts[0];
    expect(c.situationLabel).toBe("Distratado");
    expect(c.distratoNumber).toBe(distrato.distratoNumber);
  });
});

describe("Posição consolidada por cliente (mais de um contrato)", () => {
  it("agrega valor contratado, total pago e saldo devedor de todos os contratos do cliente", async () => {
    const { customer } = await setUpSignedContract("EX301");
    const { contract: contract2 } = await setUpSignedContract("EX302", customer.id);

    const portfolio2 = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract2.id },
      include: { installments: true },
    });
    const entrada2 = portfolio2.installments.find((i) => i.isDownPayment)!;
    await registerInstallmentPayment(context, entrada2.id, { amount: 40000, paidAt: new Date() });

    const position = await getCustomerFinancialPosition(context, customer.id);
    expect(position!.contracts).toHaveLength(2);
    // Dois contratos de 200000 cada = 400000 contratado; 40000 pago no segundo, nada no primeiro.
    expect(position!.consolidated.contractedValue).toBe(400000);
    expect(position!.consolidated.totalPaid).toBe(40000);
  });
});

describe("Isolamento entre organizações", () => {
  it("cliente de outra organização retorna null", async () => {
    const orgB = await prisma.organization.create({ data: { name: "Org B — Extrato" } });
    try {
      const { customer } = await setUpSignedContract("EX401");
      const contextB: AccessContext = {
        userId: crypto.randomUUID(),
        organizationId: orgB.id,
        roleNames: [],
        permissions: new Set(),
        developmentAccess: "ALL",
      };
      const position = await getCustomerFinancialPosition(contextB, customer.id);
      expect(position).toBeNull();
    } finally {
      await prisma.organization.deleteMany({ where: { id: orgB.id } });
    }
  });
});
