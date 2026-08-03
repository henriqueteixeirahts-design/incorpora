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
import { advancePayableStatus } from "@/server/payables";
import { upsertCommissionReleaseRule } from "@/server/commission-release-rules";
import { getCommissionStatement } from "@/server/commissions";

/**
 * Fase A, etapa 3 (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md, Parte 4) —
 * comissões refinadas: regra de liberação configurável por empreendimento,
 * integração automática com Contas a pagar (fornecedor = corretor/
 * imobiliária, sem lançamento duplicado) e extrato consolidado.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;
let broker: { id: string };

async function setUpSale(params: {
  downPaymentPercent: number;
  monthlyInstallments: number;
  unitNumber: string;
  customerName: string;
  customerDocument: string;
}) {
  const unit = await createUnit(context, {
    developmentId,
    unitType: "APARTMENT",
    number: params.unitNumber,
    referenceValue: 200000,
  });
  const customer = await createCustomer(context, {
    type: "INDIVIDUAL",
    name: params.customerName,
    document: params.customerDocument,
  });
  const salesTable = await createSalesTable(context, {
    developmentId,
    name: `Tabela ${params.unitNumber}`,
    downPaymentPercent: params.downPaymentPercent,
    monthlyInstallments: params.monthlyInstallments,
    commissionPercent: 6,
  });
  const proposal = await createProposal(context, {
    developmentId,
    unitId: unit.id,
    customerId: customer.id,
    salesTableId: salesTable.id,
    brokerId: broker.id,
    discountPercent: 0,
  });
  await submitProposalForApproval(context, proposal.id);
  const sale = await convertProposalToSale(context, proposal.id);
  const contract = await createContract(context, sale.id);
  await markAwaitingSignature(context, contract.id);
  return { unit, customer, salesTable, proposal, sale, contract };
}

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Comissões" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "comissoes@teste.local", fullName: "Usuário Comissões" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set() };

  const spe = await createSpe(context, {
    name: "SPE Comissões",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-comissoes@teste.local",
    phone: "62999990090",
  });
  const development = await createDevelopment(context, {
    speId: spe.id,
    name: "Empreendimento Comissões",
    type: "RESIDENTIAL_BUILDING",
  });
  developmentId = development.id;

  broker = await createBroker(context, { name: "Corretor Comissões", document: "02654427102" });
});

afterAll(async () => {
  const orgIds = [org.id];
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
  await prisma.broker.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.commissionReleaseRule.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("Liberação de comissão — gatilho padrão (assinatura do contrato)", () => {
  it("libera a comissão na assinatura e cria a conta a pagar automaticamente (fornecedor = corretor)", async () => {
    const { sale, contract } = await setUpSale({
      downPaymentPercent: 20,
      monthlyInstallments: 5,
      unitNumber: "C101",
      customerName: "Cliente Comissão 1",
      customerDocument: "02654427102",
    });

    let split = await prisma.commissionSplit.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(split.status).toBe("PENDING");
    expect(split.payableId).toBeNull();

    await confirmSignature(context, contract.id);

    split = await prisma.commissionSplit.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(split.status).toBe("RELEASED");
    expect(split.releasedAt).not.toBeNull();
    expect(split.payableId).not.toBeNull();

    const payable = await prisma.payable.findUniqueOrThrow({ where: { id: split.payableId! } });
    expect(payable.category).toBe("BROKERAGE");
    expect(Number(payable.amount)).toBe(Number(split.value));

    const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: payable.supplierId! } });
    expect(supplier.brokerId).toBe(broker.id);
    expect(supplier.name).toBe("Corretor Comissões");
  });

  it("o mesmo corretor em outra venda reaproveita o mesmo fornecedor (find-or-create idempotente)", async () => {
    const { sale, contract } = await setUpSale({
      downPaymentPercent: 20,
      monthlyInstallments: 5,
      unitNumber: "C102",
      customerName: "Cliente Comissão 2",
      customerDocument: "11144477735",
    });
    await confirmSignature(context, contract.id);

    const split = await prisma.commissionSplit.findFirstOrThrow({ where: { saleId: sale.id } });
    const payable = await prisma.payable.findUniqueOrThrow({ where: { id: split.payableId! } });

    const suppliersForBroker = await prisma.supplier.findMany({ where: { brokerId: broker.id } });
    expect(suppliersForBroker).toHaveLength(1);
    expect(payable.supplierId).toBe(suppliersForBroker[0].id);
  });

  it("pagar a conta a pagar vinculada marca a comissão como paga — sem lançamento duplicado", async () => {
    const { sale, contract } = await setUpSale({
      downPaymentPercent: 20,
      monthlyInstallments: 5,
      unitNumber: "C103",
      customerName: "Cliente Comissão 3",
      customerDocument: "96173820340",
    });
    await confirmSignature(context, contract.id);

    let split = await prisma.commissionSplit.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(split.status).toBe("RELEASED");

    // ENTERED -> REVIEWED -> APPROVED -> SCHEDULED -> PAID (mesmo fluxo de
    // qualquer conta a pagar — não existe ação separada de "pagar comissão").
    const payableId = split.payableId!;
    for (let i = 0; i < 4; i++) {
      await advancePayableStatus(context, payableId);
    }

    const payable = await prisma.payable.findUniqueOrThrow({ where: { id: payableId } });
    expect(payable.status).toBe("PAID");

    split = await prisma.commissionSplit.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(split.status).toBe("PAID");
    expect(split.paidAt).not.toBeNull();
  });
});

describe("Liberação de comissão — gatilho no recebimento da entrada", () => {
  it("não libera na assinatura; libera só depois que a entrada é paga", async () => {
    await upsertCommissionReleaseRule(context, developmentId, {
      trigger: "ON_DOWN_PAYMENT_RECEIVED",
      installmentsPaidPercent: 50,
    });

    const { sale, contract } = await setUpSale({
      downPaymentPercent: 20,
      monthlyInstallments: 5,
      unitNumber: "C201",
      customerName: "Cliente Comissão Entrada",
      customerDocument: "50864238006",
    });
    await confirmSignature(context, contract.id);

    let split = await prisma.commissionSplit.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(split.status).toBe("PENDING"); // assinou, mas a entrada ainda não foi recebida

    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id } });
    const downPaymentInstallment = await prisma.installment.findFirstOrThrow({
      where: { portfolioId: portfolio.id, isDownPayment: true },
    });

    await registerInstallmentPayment(context, downPaymentInstallment.id, {
      amount: Number(downPaymentInstallment.originalValue),
      paidAt: new Date(),
    });

    split = await prisma.commissionSplit.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(split.status).toBe("RELEASED");
  });
});

describe("Liberação de comissão — gatilho por % de parcelas pagas", () => {
  it("libera só quando o percentual configurado de parcelas pagas é atingido", async () => {
    await upsertCommissionReleaseRule(context, developmentId, {
      trigger: "ON_INSTALLMENTS_PAID_PERCENT",
      installmentsPaidPercent: 50,
    });

    const { sale, contract } = await setUpSale({
      downPaymentPercent: 25,
      monthlyInstallments: 3,
      unitNumber: "C301",
      customerName: "Cliente Comissão Percentual",
      customerDocument: "72495130847",
    });
    await confirmSignature(context, contract.id);

    let split = await prisma.commissionSplit.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(split.status).toBe("PENDING");

    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id } });
    const installments = await prisma.installment.findMany({
      where: { portfolioId: portfolio.id },
      orderBy: { sequence: "asc" },
    });
    expect(installments).toHaveLength(4); // entrada + 3 parcelas

    // Paga 1 de 4 (25%) — abaixo do limite de 50%, não libera ainda.
    await registerInstallmentPayment(context, installments[0].id, {
      amount: Number(installments[0].originalValue),
      paidAt: new Date(),
    });
    split = await prisma.commissionSplit.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(split.status).toBe("PENDING");

    // Paga a 2ª (50%) — bate o limite, libera.
    await registerInstallmentPayment(context, installments[1].id, {
      amount: Number(installments[1].originalValue),
      paidAt: new Date(),
    });
    split = await prisma.commissionSplit.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(split.status).toBe("RELEASED");
  });
});

describe("Extrato consolidado por corretor/imobiliária", () => {
  it("filtra por corretor e soma os totais por status corretamente", async () => {
    const statement = await getCommissionStatement(org.id, { brokerId: broker.id });
    expect(statement.splits.length).toBeGreaterThan(0);
    expect(statement.splits.every((s) => s.brokerId === broker.id)).toBe(true);

    const sumByStatus = (status: string) =>
      statement.splits.filter((s) => s.status === status).reduce((sum, s) => sum + Number(s.value), 0);
    expect(statement.totals.pending).toBeCloseTo(sumByStatus("PENDING"), 2);
    expect(statement.totals.released).toBeCloseTo(sumByStatus("RELEASED"), 2);
    expect(statement.totals.paid).toBeCloseTo(sumByStatus("PAID"), 2);
  });
});

describe("Isolamento entre organizações", () => {
  it("Org B não vê comissões nem regra de liberação da Org A", async () => {
    const orgB = await prisma.organization.create({ data: { name: "Org B — Comissões" } });
    const userB = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "org-b-comissoes@teste.local", fullName: "Usuário Org B" },
    });
    const contextB: AccessContext = { userId: userB.id, organizationId: orgB.id, roleNames: [], permissions: new Set() };

    try {
      await expect(
        upsertCommissionReleaseRule(contextB, developmentId, { trigger: "ON_CONTRACT_SIGNATURE", installmentsPaidPercent: 50 }),
      ).rejects.toThrow();

      const statementB = await getCommissionStatement(orgB.id, {});
      expect(statementB.splits).toHaveLength(0);
    } finally {
      await prisma.auditEvent.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.user.deleteMany({ where: { id: userB.id } });
      await prisma.organization.deleteMany({ where: { id: orgB.id } });
    }
  });
});
