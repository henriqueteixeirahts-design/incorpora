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
import { upsertDistratoRule, getEffectiveDistratoRule } from "@/server/distrato-rules";
import { createDistrato, signDistrato, getDistratoByContract } from "@/server/contract-distratos";

/**
 * Fase A, etapa 6 (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md, Parte 2.4) —
 * distrato (Lei 13.786/18): rescisão com acerto calculado (retenção
 * parametrizável por empreendimento, capada no teto legal), documento pelo
 * motor de templates, e ao concluir: unidade volta a Disponível, carteira
 * encerrada (parcelas futuras canceladas, histórico preservado), comissões
 * ainda não pagas estornadas conforme regra, devolução lançada como conta
 * a pagar. Rigor centavo a centavo exigido explicitamente pelo usuário,
 * mesmo padrão da etapa 4.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;
let customerSeq = 0;

function nextDocument() {
  customerSeq += 1;
  return `8${String(customerSeq).padStart(10, "0")}`;
}

async function setUpSignedContract(unitNumber: string, opts?: { withCommission?: boolean }) {
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

  if (opts?.withCommission) {
    await prisma.commissionSplit.create({
      data: { saleId: sale.id, beneficiaryType: "BROKER", percent: 5, value: 10000, status: "PENDING" },
    });
  }

  const contract = await createContract(context, sale.id);
  await markAwaitingSignature(context, contract.id);
  await confirmSignature(context, contract.id);
  return { contract, customer, sale, unit };
}

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Distratos" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "distratos@teste.local", fullName: "Usuário Distratos" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set() };

  const spe = await createSpe(context, {
    name: "SPE Distratos",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-distratos@teste.local",
    phone: "62999990100",
  });
  const development = await createDevelopment(context, {
    speId: spe.id,
    name: "Empreendimento Distratos",
    type: "RESIDENTIAL_BUILDING",
  });
  developmentId = development.id;
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.contractDistrato.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.payable.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.supplier.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.distratoRule.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
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

describe("Regra de retenção — teto legal", () => {
  it("aceita até 25% sem patrimônio de afetação, rejeita acima", async () => {
    const development = await createDevelopment(context, { speId: (await prisma.development.findFirstOrThrow({ where: { id: developmentId } })).speId, name: "Dev sem afetação", type: "RESIDENTIAL_BUILDING" });
    await upsertDistratoRule(context, development.id, { retentionPercent: 25, reverseCommissionOnDistrato: true });
    const rule = await getEffectiveDistratoRule(development.id);
    expect(rule.retentionPercent).toBe(25);

    await expect(
      upsertDistratoRule(context, development.id, { retentionPercent: 25.01, reverseCommissionOnDistrato: true }),
    ).rejects.toThrow(/teto legal/);
  });

  it("aceita até 50% com patrimônio de afetação instituído", async () => {
    const spe = await prisma.development.findFirstOrThrow({ where: { id: developmentId } });
    const development = await createDevelopment(context, { speId: spe.speId, name: "Dev com afetação", type: "RESIDENTIAL_BUILDING" });
    await prisma.development.update({ where: { id: development.id }, data: { hasPropertyAffectation: true } });

    await upsertDistratoRule(context, development.id, { retentionPercent: 50, reverseCommissionOnDistrato: true });
    const rule = await getEffectiveDistratoRule(development.id);
    expect(rule.retentionPercent).toBe(50);

    await expect(
      upsertDistratoRule(context, development.id, { retentionPercent: 50.5, reverseCommissionOnDistrato: true }),
    ).rejects.toThrow(/teto legal/);
  });
});

describe("Bloqueios de negócio", () => {
  it("distrato só pode ser criado em contrato assinado", async () => {
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "DT102", referenceValue: 200000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente DT102", document: nextDocument() });
    const salesTable = await createSalesTable(context, { developmentId, name: "Tabela DT102", downPaymentPercent: 20, monthlyInstallments: 4 });
    const proposal = await createProposal(context, { developmentId, unitId: unit.id, customerId: customer.id, salesTableId: salesTable.id, discountPercent: 0 });
    await submitProposalForApproval(context, proposal.id);
    const sale = await convertProposalToSale(context, proposal.id);
    const contract = await createContract(context, sale.id); // ainda DRAFT

    await expect(
      createDistrato(context, contract.id, { refundDueDate: new Date() }),
    ).rejects.toThrow(/assinado/);
  });

  it("só um distrato por contrato — rescisão é terminal", async () => {
    const { contract } = await setUpSignedContract("DT103");
    await createDistrato(context, contract.id, { refundDueDate: new Date() });

    await expect(
      createDistrato(context, contract.id, { refundDueDate: new Date() }),
    ).rejects.toThrow(/já tem um distrato/);
  });

  it("não é possível assinar o mesmo distrato duas vezes", async () => {
    const { contract } = await setUpSignedContract("DT104");
    const distrato = await createDistrato(context, contract.id, { refundDueDate: new Date() });
    await signDistrato(context, distrato.id);

    await expect(signDistrato(context, distrato.id)).rejects.toThrow(/já assinado/);
  });
});

describe("Cálculo do acerto — rigor centavo a centavo", () => {
  it("retenção sobre o total pago, sem deduções, bate com cálculo manual", async () => {
    const { contract } = await setUpSignedContract("DT201");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    // Entrada (40000) paga integral + 1a parcela (40000) paga integral + 2a parcela parcial (10000 de 40000).
    const entrada = portfolio.installments.find((i) => i.isDownPayment)!;
    const parcelas = portfolio.installments.filter((i) => !i.isDownPayment).sort((a, b) => a.sequence - b.sequence);
    await registerInstallmentPayment(context, entrada.id, { amount: 40000, paidAt: new Date() });
    await registerInstallmentPayment(context, parcelas[0].id, { amount: 40000, paidAt: new Date() });
    await registerInstallmentPayment(context, parcelas[1].id, { amount: 10000, paidAt: new Date() });

    // Total pago = 40000 + 40000 + 10000 = 90000. Retenção 25% = 22500. Refund = 67500.
    const distrato = await createDistrato(context, contract.id, { refundDueDate: new Date("2026-09-01") });
    expect(Number(distrato.totalPaid)).toBe(90000);
    expect(Number(distrato.retentionPercent)).toBe(25);
    expect(Number(distrato.retentionAmount)).toBe(22500);
    expect(Number(distrato.refundAmount)).toBe(67500);
    expect(distrato.distratoNumber).toBe(`${contract.contractNumber}-DT01`);
  });

  it("deduções de corretagem e fruição reduzem o valor a devolver", async () => {
    const { contract } = await setUpSignedContract("DT202");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    const entrada = portfolio.installments.find((i) => i.isDownPayment)!;
    await registerInstallmentPayment(context, entrada.id, { amount: 40000, paidAt: new Date() });

    // Total pago = 40000. Retenção 25% = 10000. Deduções: 3000 corretagem + 2000 fruição.
    // Refund = 40000 - 10000 - 3000 - 2000 = 25000.
    const distrato = await createDistrato(context, contract.id, {
      refundDueDate: new Date("2026-09-01"),
      brokerageDeductionAmount: 3000,
      occupancyFeeAmount: 2000,
    });
    expect(Number(distrato.totalPaid)).toBe(40000);
    expect(Number(distrato.retentionAmount)).toBe(10000);
    expect(Number(distrato.brokerageDeductionAmount)).toBe(3000);
    expect(Number(distrato.occupancyFeeAmount)).toBe(2000);
    expect(Number(distrato.refundAmount)).toBe(25000);
  });

  it("recalcula o total pago na assinatura se houve pagamento novo entre o rascunho e a assinatura, mas mantém o percentual travado", async () => {
    const { contract } = await setUpSignedContract("DT203");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    const entrada = portfolio.installments.find((i) => i.isDownPayment)!;
    const parcelas = portfolio.installments.filter((i) => !i.isDownPayment).sort((a, b) => a.sequence - b.sequence);
    await registerInstallmentPayment(context, entrada.id, { amount: 40000, paidAt: new Date() });

    const distrato = await createDistrato(context, contract.id, { refundDueDate: new Date("2026-09-01") });
    expect(Number(distrato.totalPaid)).toBe(40000);

    // Pagamento novo enquanto o distrato ainda está em rascunho.
    await registerInstallmentPayment(context, parcelas[0].id, { amount: 40000, paidAt: new Date() });

    const signed = await signDistrato(context, distrato.id);
    // Total pago recalculado: 40000 + 40000 = 80000. Retenção continua 25% (travada do rascunho) = 20000. Refund = 60000.
    expect(Number(signed.totalPaid)).toBe(80000);
    expect(Number(signed.retentionPercent)).toBe(25);
    expect(Number(signed.retentionAmount)).toBe(20000);
    expect(Number(signed.refundAmount)).toBe(60000);
  });
});

describe("Assinar distrato — efeitos (rigor centavo a centavo)", () => {
  it("contrato cancelado, unidade volta a Disponível, parcelas futuras canceladas, histórico preservado", async () => {
    const { contract, unit } = await setUpSignedContract("DT301");
    const portfolioBefore = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    const entrada = portfolioBefore.installments.find((i) => i.isDownPayment)!;
    await registerInstallmentPayment(context, entrada.id, { amount: 40000, paidAt: new Date() });

    const distrato = await createDistrato(context, contract.id, { refundDueDate: new Date("2026-09-01") });
    await signDistrato(context, distrato.id);

    const contractAfter = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(contractAfter.status).toBe("CANCELLED");

    const unitAfter = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(unitAfter.status).toBe("AVAILABLE");

    const portfolioAfter = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    const entradaAfter = portfolioAfter.installments.find((i) => i.id === entrada.id)!;
    expect(entradaAfter.status).toBe("PAID"); // parcela recebida nunca é tocada
    expect(Number(entradaAfter.paidAmount)).toBe(40000);

    const pendentesAfter = portfolioAfter.installments.filter((i) => i.id !== entrada.id);
    expect(pendentesAfter.every((i) => i.status === "CANCELLED")).toBe(true);
    expect(pendentesAfter.every((i) => Number(i.originalValue) === 40000)).toBe(true); // nunca apagadas, valor preservado
    expect(portfolioAfter.installments).toHaveLength(portfolioBefore.installments.length); // nada deletado
  });

  it("estorna comissões ainda não pagas quando a regra manda, e cria a conta a pagar da devolução com fornecedor = cliente", async () => {
    const { contract, customer } = await setUpSignedContract("DT302", { withCommission: true });
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    const entrada = portfolio.installments.find((i) => i.isDownPayment)!;
    await registerInstallmentPayment(context, entrada.id, { amount: 40000, paidAt: new Date() });

    const distrato = await createDistrato(context, contract.id, { refundDueDate: new Date("2026-09-01") });
    const signed = await signDistrato(context, distrato.id);

    const split = await prisma.commissionSplit.findFirstOrThrow({ where: { saleId: contract.saleId } });
    expect(split.status).toBe("CANCELLED");

    expect(signed.refundPayableId).not.toBeNull();
    const payable = await prisma.payable.findUniqueOrThrow({
      where: { id: signed.refundPayableId! },
      include: { supplier: true },
    });
    expect(payable.category).toBe("CANCELLATION_REFUND");
    expect(Number(payable.amount)).toBe(Number(signed.refundAmount));
    expect(payable.supplier?.customerId).toBe(customer.id);
    expect(payable.contractId).toBe(contract.id);
  });

  it("não cria conta a pagar quando o valor a devolver é zero", async () => {
    const { contract } = await setUpSignedContract("DT303");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    const entrada = portfolio.installments.find((i) => i.isDownPayment)!;
    await registerInstallmentPayment(context, entrada.id, { amount: 40000, paidAt: new Date() });

    // Deduções >= total pago -> refund zerado.
    const distrato = await createDistrato(context, contract.id, {
      refundDueDate: new Date("2026-09-01"),
      brokerageDeductionAmount: 40000,
    });
    expect(Number(distrato.refundAmount)).toBe(0);

    const signed = await signDistrato(context, distrato.id);
    expect(signed.refundPayableId).toBeNull();
  });

  it("não estorna comissões quando a regra do empreendimento desativa o estorno", async () => {
    const spe = await prisma.development.findFirstOrThrow({ where: { id: developmentId } });
    const noReversalDev = await createDevelopment(context, { speId: spe.speId, name: "Dev sem estorno", type: "RESIDENTIAL_BUILDING" });
    await upsertDistratoRule(context, noReversalDev.id, { retentionPercent: 25, reverseCommissionOnDistrato: false });

    const savedDevelopmentId = developmentId;
    developmentId = noReversalDev.id;
    const { contract } = await setUpSignedContract("DT304", { withCommission: true });
    developmentId = savedDevelopmentId;

    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    const entrada = portfolio.installments.find((i) => i.isDownPayment)!;
    await registerInstallmentPayment(context, entrada.id, { amount: 40000, paidAt: new Date() });

    const distrato = await createDistrato(context, contract.id, { refundDueDate: new Date("2026-09-01") });
    await signDistrato(context, distrato.id);

    // O split já foi liberado (RELEASED) na assinatura do contrato pela regra padrão
    // de liberação (etapa 3) — o que importa aqui é que o distrato NÃO o cancela.
    const split = await prisma.commissionSplit.findFirstOrThrow({ where: { saleId: contract.saleId } });
    expect(split.status).toBe("RELEASED");
  });
});

describe("Isolamento entre organizações", () => {
  it("Org B não vê nem assina distrato da Org A", async () => {
    const orgB = await prisma.organization.create({ data: { name: "Org B — Distratos" } });
    const userB = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "org-b-distratos@teste.local", fullName: "Usuário Org B" },
    });
    const contextB: AccessContext = { userId: userB.id, organizationId: orgB.id, roleNames: [], permissions: new Set() };

    try {
      const { contract } = await setUpSignedContract("DT401");
      const distrato = await createDistrato(context, contract.id, { refundDueDate: new Date() });

      await expect(signDistrato(contextB, distrato.id)).rejects.toThrow();

      const listB = await getDistratoByContract(orgB.id, contract.id);
      expect(listB).toBeNull();
    } finally {
      await prisma.auditEvent.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.user.deleteMany({ where: { id: userB.id } });
      await prisma.organization.deleteMany({ where: { id: orgB.id } });
    }
  });
});
