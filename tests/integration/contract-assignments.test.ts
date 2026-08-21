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
import { registerInstallmentPayment } from "@/server/receivables";
import { createAssignment, signAssignment, listAssignments } from "@/server/contract-assignments";

/**
 * Fase A, etapa 5 (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md, Parte 2.3) —
 * cessão de direitos: titularidade do contrato transferida a um novo
 * cliente. Diferente do aditivo de renegociação de fluxo (etapa 4), a
 * cessão NÃO reprograma a carteira — as mesmas parcelas continuam
 * existindo intactas, só `Contract.customerId` muda. `Sale.customerId`
 * (a venda original) nunca é tocado — é o registro histórico de quem
 * comprou originalmente.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;
let customerSeq = 0;

function nextDocument() {
  customerSeq += 1;
  return `9${String(customerSeq).padStart(10, "0")}`;
}

async function setUpSignedContract(unitNumber: string) {
  const unit = await createUnit(context, {
    developmentId,
    unitType: "APARTMENT",
    number: unitNumber,
    referenceValue: 200000,
  });
  const customer = await createCustomer(context, {
    type: "INDIVIDUAL",
    name: `Cliente ${unitNumber}`,
    document: nextDocument(),
  });
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
  org = await prisma.organization.create({ data: { name: "Org — Cessões" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "cessoes@teste.local", fullName: "Usuário Cessões" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Cessões",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-cessoes@teste.local",
    phone: "62999990100",
  });
  const development = await createDevelopment(context, {
    speId: spe.id,
    name: "Empreendimento Cessões",
    type: "RESIDENTIAL_BUILDING",
  });
  developmentId = development.id;
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.contractAssignment.deleteMany({ where: { organizationId: { in: orgIds } } });
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

describe("Numeração vinculada", () => {
  it("gera CT-...-CS01, CS02... sequencial por contrato", async () => {
    const { contract } = await setUpSignedContract("CS101");
    const cessionario1 = await createCustomer(context, { type: "INDIVIDUAL", name: "Cessionário 1", document: nextDocument() });
    const cessionario2 = await createCustomer(context, { type: "INDIVIDUAL", name: "Cessionário 2", document: nextDocument() });

    const first = await createAssignment(context, contract.id, {
      newCustomerId: cessionario1.id,
      assignmentDate: new Date("2026-01-10"),
    });
    expect(first.assignmentNumber).toBe(`${contract.contractNumber}-CS01`);
    expect(first.sequenceNumber).toBe(1);
    await signAssignment(context, first.id);

    const second = await createAssignment(context, contract.id, {
      newCustomerId: cessionario2.id,
      assignmentDate: new Date("2026-02-10"),
    });
    expect(second.assignmentNumber).toBe(`${contract.contractNumber}-CS02`);
    expect(second.sequenceNumber).toBe(2);

    const list = await listAssignments(context, contract.id);
    expect(list.map((a) => a.assignmentNumber)).toEqual([first.assignmentNumber, second.assignmentNumber]);
  });

  it("cessão só pode ser criada em contrato assinado (vigente)", async () => {
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "CS102", referenceValue: 200000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente CS102", document: nextDocument() });
    const salesTable = await createSalesTable(context, { developmentId, name: "Tabela CS102", downPaymentPercent: 20, monthlyInstallments: 4 });
    const proposal = await createProposal(context, { developmentId, unitId: unit.id, customerId: customer.id, salesTableId: salesTable.id, discountPercent: 0 });
    await submitProposalForApproval(context, proposal.id);
    const sale = await convertProposalToSale(context, proposal.id);
    const contract = await createContract(context, sale.id); // ainda DRAFT

    const cessionario = await createCustomer(context, { type: "INDIVIDUAL", name: "Cessionário CS102", document: nextDocument() });

    await expect(
      createAssignment(context, contract.id, { newCustomerId: cessionario.id, assignmentDate: new Date() }),
    ).rejects.toThrow(/assinado/);
  });
});

describe("Bloqueios de negócio", () => {
  it("cessionário não pode ser o próprio titular atual", async () => {
    const { contract, customer } = await setUpSignedContract("CS201");

    await expect(
      createAssignment(context, contract.id, { newCustomerId: customer.id, assignmentDate: new Date() }),
    ).rejects.toThrow(/titular atual/);
  });

  it("só uma cessão em rascunho por vez por contrato", async () => {
    const { contract } = await setUpSignedContract("CS202");
    const cessionario1 = await createCustomer(context, { type: "INDIVIDUAL", name: "Cessionário CS202-1", document: nextDocument() });
    const cessionario2 = await createCustomer(context, { type: "INDIVIDUAL", name: "Cessionário CS202-2", document: nextDocument() });

    await createAssignment(context, contract.id, { newCustomerId: cessionario1.id, assignmentDate: new Date() });

    await expect(
      createAssignment(context, contract.id, { newCustomerId: cessionario2.id, assignmentDate: new Date() }),
    ).rejects.toThrow(/rascunho/);
  });

  it("não é possível assinar a mesma cessão duas vezes", async () => {
    const { contract } = await setUpSignedContract("CS203");
    const cessionario = await createCustomer(context, { type: "INDIVIDUAL", name: "Cessionário CS203", document: nextDocument() });
    const assignment = await createAssignment(context, contract.id, { newCustomerId: cessionario.id, assignmentDate: new Date() });
    await signAssignment(context, assignment.id);

    await expect(signAssignment(context, assignment.id)).rejects.toThrow(/já assinada/);
  });
});

describe("Assinar cessão — titularidade, carteira e histórico (rigor centavo a centavo)", () => {
  it("transfere Contract.customerId, preserva Sale.customerId e não mexe nas parcelas existentes", async () => {
    const { contract, customer: cedente, sale } = await setUpSignedContract("CS301");

    const portfolioBefore = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    // Paga a entrada integralmente e a 1a parcela parcialmente, pra provar
    // que a cessão (que não reprograma nada) deixa esse histórico intacto.
    const entrada = portfolioBefore.installments.find((i) => i.isDownPayment)!;
    await registerInstallmentPayment(context, entrada.id, { amount: Number(entrada.originalValue), paidAt: new Date() });
    const parcela1 = portfolioBefore.installments.filter((i) => !i.isDownPayment).sort((a, b) => a.sequence - b.sequence)[0];
    await registerInstallmentPayment(context, parcela1.id, { amount: 10000, paidAt: new Date() });

    const cessionario = await createCustomer(context, { type: "INDIVIDUAL", name: "Cessionário CS301", document: nextDocument() });
    const assignment = await createAssignment(context, contract.id, {
      newCustomerId: cessionario.id,
      assignmentDate: new Date("2026-03-15"),
      notes: "Cessão sem taxa",
    });

    await signAssignment(context, assignment.id);

    const contractAfter = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(contractAfter.customerId).toBe(cessionario.id);

    const saleAfter = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(saleAfter.customerId).toBe(cedente.id); // venda original nunca muda

    const portfolioAfter = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    // Nenhuma parcela nova (sem taxa de cessão) e nenhuma alterada.
    expect(portfolioAfter.installments).toHaveLength(portfolioBefore.installments.length);
    expect(Number(portfolioAfter.totalValue)).toBe(Number(portfolioBefore.totalValue));
    for (const installment of portfolioBefore.installments) {
      const before =
        installment.id === entrada.id
          ? { status: "PAID", paidAmount: Number(entrada.originalValue) }
          : installment.id === parcela1.id
            ? { status: "PARTIALLY_PAID", paidAmount: 10000 }
            : { status: installment.status, paidAmount: Number(installment.paidAmount) };
      const after = portfolioAfter.installments.find((i) => i.id === installment.id)!;
      expect(after.status).toBe(before.status);
      expect(Number(after.paidAmount)).toBe(before.paidAmount);
      expect(Number(after.originalValue)).toBe(Number(installment.originalValue));
    }

    const assignmentAfter = await prisma.contractAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(assignmentAfter.status).toBe("SIGNED");
    expect(assignmentAfter.previousCustomerId).toBe(cedente.id);
    expect(assignmentAfter.newCustomerId).toBe(cessionario.id);
  });

  it("taxa de cessão vira recebível avulso (não mais parcela na carteira do imóvel — Fase B, Parte 4.3)", async () => {
    const { contract } = await setUpSignedContract("CS302");
    const portfolioBefore = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    const totalBefore = Number(portfolioBefore.totalValue);

    const cessionario = await createCustomer(context, { type: "INDIVIDUAL", name: "Cessionário CS302", document: nextDocument() });
    const assignment = await createAssignment(context, contract.id, {
      newCustomerId: cessionario.id,
      assignmentDate: new Date("2026-04-01"),
      feeAmount: 3500,
    });
    await signAssignment(context, assignment.id);

    // A carteira do imóvel não ganha nenhuma parcela nova nem muda de total —
    // a taxa de cessão não é mais uma Installment.
    const portfolioAfter = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    expect(portfolioAfter.installments).toHaveLength(portfolioBefore.installments.length);
    expect(Number(portfolioAfter.totalValue)).toBe(totalBefore);

    // Em vez disso, é um Receivable avulso, cobrado do cessionário, sem
    // motor de correção (fora da carteira, nunca acumula juros/multa).
    const receivable = await prisma.receivable.findUniqueOrThrow({ where: { contractAssignmentId: assignment.id } });
    expect(receivable.category).toBe("ASSIGNMENT_FEE");
    expect(Number(receivable.amount)).toBe(3500);
    expect(receivable.status).toBe("PENDING");
    expect(receivable.customerId).toBe(cessionario.id);
    expect(receivable.developmentId).toBe(contract.developmentId);
    expect(receivable.dueDate.toISOString().slice(0, 10)).toBe("2026-04-01");
  });
});

describe("Isolamento entre organizações", () => {
  it("Org B não vê nem assina cessão da Org A", async () => {
    const orgB = await prisma.organization.create({ data: { name: "Org B — Cessões" } });
    const userB = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "org-b-cessoes@teste.local", fullName: "Usuário Org B" },
    });
    const contextB: AccessContext = { userId: userB.id, organizationId: orgB.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

    try {
      const { contract } = await setUpSignedContract("CS401");
      const cessionario = await createCustomer(context, { type: "INDIVIDUAL", name: "Cessionário CS401", document: nextDocument() });
      const assignment = await createAssignment(context, contract.id, { newCustomerId: cessionario.id, assignmentDate: new Date() });

      await expect(signAssignment(contextB, assignment.id)).rejects.toThrow();

      const listB = await listAssignments(contextB, contract.id);
      expect(listB).toHaveLength(0);
    } finally {
      await prisma.auditEvent.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.user.deleteMany({ where: { id: userB.id } });
      await prisma.organization.deleteMany({ where: { id: orgB.id } });
    }
  });
});
