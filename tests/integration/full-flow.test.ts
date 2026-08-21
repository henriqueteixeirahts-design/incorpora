import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { createUnit } from "@/server/units";
import { createCustomer } from "@/server/customers";
import { createSalesTable, setSalesTableUnitPrice } from "@/server/sales-tables";
import { createReservation } from "@/server/reservations";
import { createProposal, submitProposalForApproval, getProposal } from "@/server/proposals";
import { convertProposalToSale, getSale } from "@/server/sales";
import { createContract, markAwaitingSignature, confirmSignature, getContract } from "@/server/contracts";
import { registerInstallmentPayment } from "@/server/receivables";

/**
 * Suíte de regressão de fluxo completo (Pilar 3.2 de
 * docs/ESPEC_MULTITENANT_FUNDACOES.md) — converte em teste permanente o
 * ciclo reserva → proposta → aprovação → venda → contrato → assinatura →
 * carteira → recebimento que a Sprint 10 rodou manualmente uma vez.
 * Roda a cada push/PR a partir de agora (ver .github/workflows/ci.yml),
 * em vez de depender de alguém lembrar de repetir a checagem manual.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;

let developmentId: string;
let unitId: string;
let customerId: string;
let salesTableId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Regressão de Fluxo Completo" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "fluxo-completo@teste.local", fullName: "Usuário Fluxo Completo" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Fluxo Completo",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-fluxo@teste.local",
    phone: "62999990020",
  });
  const development = await createDevelopment(context, {
    speId: spe.id,
    name: "Empreendimento Fluxo Completo",
    type: "RESIDENTIAL_BUILDING",
  });
  developmentId = development.id;

  const unit = await createUnit(context, {
    developmentId,
    unitType: "APARTMENT",
    number: "101",
    referenceValue: 500000,
  });
  unitId = unit.id;

  const customer = await createCustomer(context, {
    type: "INDIVIDUAL",
    name: "Cliente Fluxo Completo",
    document: "02654427102",
    email: "cliente-fluxo@teste.local",
    phone: "62999998888",
  });
  customerId = customer.id;

  const salesTable = await createSalesTable(context, {
    developmentId,
    name: "Tabela Fluxo Completo",
    downPaymentPercent: 20,
    monthlyInstallments: 10,
  });
  salesTableId = salesTable.id;
  await setSalesTableUnitPrice(context, salesTableId, unitId, 500000);
});

afterAll(async () => {
  await prisma.installmentPayment.deleteMany({ where: { installment: { portfolio: { organizationId: org.id } } } });
  await prisma.financialCalculation.deleteMany({ where: { installment: { portfolio: { organizationId: org.id } } } });
  await prisma.installment.deleteMany({ where: { portfolio: { organizationId: org.id } } });
  await prisma.receivablePortfolio.deleteMany({ where: { organizationId: org.id } });
  await prisma.contract.deleteMany({ where: { organizationId: org.id } });
  await prisma.commissionSplit.deleteMany({ where: { sale: { organizationId: org.id } } });
  await prisma.sale.deleteMany({ where: { organizationId: org.id } });
  await prisma.reservation.deleteMany({ where: { organizationId: org.id } });
  await prisma.proposalApproval.deleteMany({ where: { proposal: { organizationId: org.id } } });
  await prisma.proposal.deleteMany({ where: { organizationId: org.id } });
  await prisma.salesTableUnit.deleteMany({ where: { salesTableId } });
  await prisma.salesTable.deleteMany({ where: { developmentId } });
  await prisma.unit.deleteMany({ where: { developmentId } });
  await prisma.customer.deleteMany({ where: { organizationId: org.id } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: org.id } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: org.id } });
  await prisma.development.deleteMany({ where: { organizationId: org.id } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: org.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: org.id } });
});

describe("Ciclo completo: reserva → proposta → aprovação → venda → contrato → assinatura → carteira → recebimento", () => {
  it("percorre o fluxo inteiro com as transições de status corretas em cada etapa", async () => {
    // 1. Reserva
    const reservationResult = await createReservation(context, {
      unitId,
      customerId,
      salesTableId,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    });
    if (reservationResult.kind !== "reservation") throw new Error("Esperava reserva, não fila de espera.");
    const reservation = reservationResult.reservation;
    expect(reservation.status).toBe("ACTIVE");
    let unit = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
    expect(unit.status).toBe("RESERVED");

    // 2. Proposta (desconto 0%, dentro da tabela padrão — desvio de VPL 0%,
    // logo o motor de avaliação aprova automaticamente, sem passar pelo
    // módulo de alçada — docs/ESPEC_MODULO_COMERCIAL.md, Parte 5.2/5.3).
    const proposal = await createProposal(context, {
      developmentId,
      unitId,
      customerId,
      salesTableId,
      discountPercent: 0,
    });
    expect(Number(proposal.salePrice)).toBe(500000);
    expect(proposal.status).toBe("DRAFT");
    expect(proposal.evaluationStatus).toBe("APPROVED_AUTO");

    // 3. Envio pra aprovação — aprovação automática, sem alçada humana
    await submitProposalForApproval(context, proposal.id);
    let proposalDetail = await getProposal(context, proposal.id);
    expect(proposalDetail?.status).toBe("APPROVED");
    unit = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
    expect(unit.status).toBe("PROPOSAL_APPROVED");

    // 5. Conversão em venda
    const sale = await convertProposalToSale(context, proposal.id);
    expect(Number(sale.salePrice)).toBe(500000);
    proposalDetail = await getProposal(context, proposal.id);
    expect(proposalDetail?.status).toBe("CONVERTED");
    unit = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
    expect(unit.status).toBe("CONTRACT_IN_PROGRESS");
    const reservationAfterSale = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(reservationAfterSale.status).toBe("CONVERTED");

    const saleDetail = await getSale(context, sale.id);
    expect(saleDetail?.id).toBe(sale.id);

    // 6. Contrato (rascunho)
    const contract = await createContract(context, sale.id);
    expect(contract.status).toBe("DRAFT");
    expect(contract.contractNumber).toBeTruthy();

    // 7. Envio pra assinatura
    await markAwaitingSignature(context, contract.id);
    let contractDetail = await getContract(context, contract.id);
    expect(contractDetail?.status).toBe("AWAITING_SIGNATURE");
    unit = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
    expect(unit.status).toBe("AWAITING_SIGNATURE");

    // 8. Assinatura confirmada — gera a carteira de recebíveis automaticamente
    await confirmSignature(context, contract.id);
    contractDetail = await getContract(context, contract.id);
    expect(contractDetail?.status).toBe("SIGNED");
    expect(contractDetail?.signedAt).not.toBeNull();
    unit = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
    expect(unit.status).toBe("SOLD");

    const portfolio = await prisma.receivablePortfolio.findUniqueOrThrow({ where: { contractId: contract.id } });
    expect(Number(portfolio.totalValue)).toBe(500000);

    const installments = await prisma.installment.findMany({
      where: { portfolioId: portfolio.id },
      orderBy: { sequence: "asc" },
    });
    // Entrada (20%) + 10 parcelas mensais = 11 itens
    expect(installments).toHaveLength(11);
    expect(installments[0].label).toBe("Entrada");
    expect(Number(installments[0].originalValue)).toBe(100000); // 20% de 500.000
    const totalInstallments = installments.reduce((sum, i) => sum + Number(i.originalValue), 0);
    expect(totalInstallments).toBeCloseTo(500000, 2);

    // 9. Recebimento — quita a Entrada integralmente
    const entrada = installments[0];
    await registerInstallmentPayment(context, entrada.id, {
      amount: Number(entrada.originalValue),
      paidAt: new Date(),
    });
    const entradaPaid = await prisma.installment.findUniqueOrThrow({ where: { id: entrada.id } });
    expect(entradaPaid.status).toBe("PAID");
    expect(Number(entradaPaid.paidAmount)).toBe(Number(entrada.originalValue));

    // 10. Recebimento parcial da primeira parcela mensal
    const primeiraMensal = installments[1];
    const metade = round2(Number(primeiraMensal.originalValue) / 2);
    await registerInstallmentPayment(context, primeiraMensal.id, { amount: metade, paidAt: new Date() });
    const mensalParcial = await prisma.installment.findUniqueOrThrow({ where: { id: primeiraMensal.id } });
    expect(mensalParcial.status).toBe("PARTIALLY_PAID");
    expect(Number(mensalParcial.paidAmount)).toBe(metade);
  });
});

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
