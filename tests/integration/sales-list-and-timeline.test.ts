import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { createUnit } from "@/server/units";
import { createCustomer } from "@/server/customers";
import { createBroker } from "@/server/crm";
import { createSalesTable } from "@/server/sales-tables";
import { createReservation } from "@/server/reservations";
import { createProposal, submitProposalForApproval } from "@/server/proposals";
import { convertProposalToSale, listSalesPaged } from "@/server/sales";
import { createContract, markAwaitingSignature, confirmSignature } from "@/server/contracts";
import { registerInstallmentPayment } from "@/server/receivables";
import { listSaleTimeline } from "@/server/sale-timeline";

/**
 * Fase A, etapa 2 (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md, Parte 3) — lista
 * de vendas refinada (nº sequencial, filtros, status da carteira) e a linha
 * do tempo da venda montada sobre o DevelopmentEvent já existente.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;
// Entrada de 20% — acima do mínimo default de 10% da regra de avaliação de
// propostas, senão toda proposta sem tabela própria (0% de entrada) reprova
// automaticamente e nunca chega a "APPROVED" pra virar venda.
let defaultSalesTableId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Vendas Lista e Timeline" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "vendas-lista@teste.local", fullName: "Usuário Vendas Lista" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Vendas Lista",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-vendas-lista@teste.local",
    phone: "62999990060",
  });
  const development = await createDevelopment(context, {
    speId: spe.id,
    name: "Empreendimento Vendas Lista",
    type: "RESIDENTIAL_BUILDING",
  });
  developmentId = development.id;

  const defaultSalesTable = await createSalesTable(context, {
    developmentId,
    name: "Tabela Padrão Vendas Lista",
    downPaymentPercent: 20,
    monthlyInstallments: 5,
  });
  defaultSalesTableId = defaultSalesTable.id;
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.installmentPayment.deleteMany({ where: { installment: { portfolio: { organizationId: { in: orgIds } } } } });
  await prisma.installment.deleteMany({ where: { portfolio: { organizationId: { in: orgIds } } } });
  await prisma.receivablePortfolio.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.commissionSplit.deleteMany({ where: { sale: { organizationId: { in: orgIds } } } });
  await prisma.contract.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.sale.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.reservation.deleteMany({ where: { organizationId: { in: orgIds } } });
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

describe("Nº sequencial da venda + reserva vinculada", () => {
  it("gera V-<ano>-0001, 0002... por organização, e guarda a reserva ativa no momento da conversão", async () => {
    const unit1 = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "L101", referenceValue: 300000 });
    const unit2 = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "L102", referenceValue: 300000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente Vendas Lista", document: "02654427102" });

    const reservationResult = await createReservation(context, {
      unitId: unit1.id,
      customerId: customer.id,
      expiresAt: new Date(Date.now() + 86400000),
    });
    if (reservationResult.kind !== "reservation") throw new Error("Esperava reserva.");

    const proposal1 = await createProposal(context, { developmentId, unitId: unit1.id, customerId: customer.id, salesTableId: defaultSalesTableId, discountPercent: 0 });
    await submitProposalForApproval(context, proposal1.id);
    const sale1 = await convertProposalToSale(context, proposal1.id);

    const proposal2 = await createProposal(context, { developmentId, unitId: unit2.id, customerId: customer.id, salesTableId: defaultSalesTableId, discountPercent: 0 });
    await submitProposalForApproval(context, proposal2.id);
    const sale2 = await convertProposalToSale(context, proposal2.id);

    const year = new Date().getFullYear();
    expect(sale1.saleNumber.startsWith(`V-${year}-`)).toBe(true);
    expect(sale2.saleNumber.startsWith(`V-${year}-`)).toBe(true);
    expect(sale1.saleNumber).not.toBe(sale2.saleNumber);

    expect(sale1.reservationId).toBe(reservationResult.reservation.id);
    expect(sale2.reservationId).toBeNull(); // não tinha reserva ativa nessa unidade
  });
});

describe("Lista de vendas — filtros", () => {
  it("filtra por corretor, status do contrato e status da carteira", async () => {
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "L201", referenceValue: 200000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente Filtro", document: "11144477735" });
    const broker = await createBroker(context, { name: "Corretor Filtro" });

    const salesTable = await createSalesTable(context, {
      developmentId,
      name: "Tabela Filtro",
      downPaymentPercent: 50,
      monthlyInstallments: 1,
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

    const byBroker = await listSalesPaged(context, { brokerId: broker.id });
    expect(byBroker.items.map((s) => s.id)).toContain(sale.id);

    const noContract = await listSalesPaged(context, { contractStatus: "NONE" });
    expect(noContract.items.map((s) => s.id)).toContain(sale.id);

    const contract = await createContract(context, sale.id);
    const draftFilter = await listSalesPaged(context, { contractStatus: "DRAFT" });
    expect(draftFilter.items.map((s) => s.id)).toContain(sale.id);
    const noContractAfter = await listSalesPaged(context, { contractStatus: "NONE" });
    expect(noContractAfter.items.map((s) => s.id)).not.toContain(sale.id);

    await markAwaitingSignature(context, contract.id);
    await confirmSignature(context, contract.id);

    const emDia = await listSalesPaged(context, { walletStatus: "EM_DIA" });
    expect(emDia.items.map((s) => s.id)).toContain(sale.id);

    // Força uma parcela vencida no passado direto no banco pra simular inadimplência
    // sem esperar o cron/lazy-sweep de recálculo.
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id } });
    const installment = await prisma.installment.findFirstOrThrow({ where: { portfolioId: portfolio.id }, orderBy: { sequence: "asc" } });
    await prisma.installment.update({
      where: { id: installment.id },
      data: { status: "OVERDUE", dueDate: new Date(Date.now() - 5 * 86400000) },
    });

    const inadimplente = await listSalesPaged(context, { walletStatus: "INADIMPLENTE" });
    expect(inadimplente.items.map((s) => s.id)).toContain(sale.id);
    const emDiaAfter = await listSalesPaged(context, { walletStatus: "EM_DIA" });
    expect(emDiaAfter.items.map((s) => s.id)).not.toContain(sale.id);
  });
});

describe("Linha do tempo da venda", () => {
  it("monta a cadeia cronológica reserva -> proposta -> venda -> contrato -> assinatura -> recebimento", async () => {
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "L301", referenceValue: 100000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente Timeline", document: "96173820340" });
    const salesTable = await createSalesTable(context, {
      developmentId,
      name: "Tabela Timeline",
      downPaymentPercent: 100,
      monthlyInstallments: 0,
    });

    const reservationResult = await createReservation(context, {
      unitId: unit.id,
      customerId: customer.id,
      expiresAt: new Date(Date.now() + 86400000),
    });
    if (reservationResult.kind !== "reservation") throw new Error("Esperava reserva.");

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

    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id } });
    const installment = await prisma.installment.findFirstOrThrow({ where: { portfolioId: portfolio.id } });
    await registerInstallmentPayment(context, installment.id, { amount: Number(installment.originalValue), paidAt: new Date() });

    const contractWithPortfolio = await prisma.contract.findUniqueOrThrow({
      where: { id: contract.id },
      include: { portfolio: { include: { installments: { select: { id: true } } } } },
    });

    const timeline = await listSaleTimeline(
      org.id,
      { id: sale.id, proposalId: sale.proposalId, reservationId: sale.reservationId },
      contractWithPortfolio,
    );

    const eventTypes = timeline.map((e) => e.eventType);
    // Sem "proposal.submitted": esse evento só é emitido quando a proposta
    // cai em PENDING_ANALYSIS e entra no módulo de alçada — aprovação
    // automática (VPL dentro da tolerância) pula direto pra approved_auto.
    expect(eventTypes).toEqual([
      "reservation.created",
      "proposal.created",
      "proposal.approved_auto",
      "sale.completed",
      "contract.drafted",
      "contract.sent_for_signature",
      "receivable_portfolio.created",
      "contract.signed",
      "installment.paid",
    ]);

    // Cronológico de verdade, não só por eventType — occurredAt crescente.
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].occurredAt.getTime()).toBeGreaterThanOrEqual(timeline[i - 1].occurredAt.getTime());
    }

    expect(timeline.find((e) => e.eventType === "reservation.created")?.label).toBe("Reserva criada");
    expect(timeline.find((e) => e.eventType === "contract.signed")?.label).toBe("Contrato assinado");

    // docs/RELATORIO_TESTDRIVE.md, achado 20 — cada evento deve mostrar quem
    // executou a ação, não só a data. Todo evento nesta cadeia foi disparado
    // pelo mesmo `context.userId` (não há troca de usuário no meio do fluxo).
    for (const event of timeline) {
      expect(event.actorName).toBe("Usuário Vendas Lista");
    }
  });

  it("venda sem reserva prévia (fora da tabela) não mostra evento de reserva — não é bug, é o campo nulo", async () => {
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "L401", referenceValue: 50000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente Sem Reserva", document: "50864238006" });

    const proposal = await createProposal(context, { developmentId, unitId: unit.id, customerId: customer.id, salesTableId: defaultSalesTableId, discountPercent: 0 });
    await submitProposalForApproval(context, proposal.id);
    const sale = await convertProposalToSale(context, proposal.id);

    expect(sale.reservationId).toBeNull();

    const timeline = await listSaleTimeline(org.id, { id: sale.id, proposalId: sale.proposalId, reservationId: sale.reservationId }, null);
    expect(timeline.some((e) => e.eventType.startsWith("reservation."))).toBe(false);
    expect(timeline.some((e) => e.eventType === "sale.completed")).toBe(true);
  });
});

describe("Isolamento entre organizações", () => {
  it("Org B não vê vendas nem timeline da Org A", async () => {
    const orgB = await prisma.organization.create({ data: { name: "Org B — Vendas Lista" } });
    const userB = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "org-b-vendas-lista@teste.local", fullName: "Usuário Org B" },
    });

    try {
      const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "L501", referenceValue: 100000 });
      const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente Isolamento Vendas", document: "72495130847" });
      const proposal = await createProposal(context, { developmentId, unitId: unit.id, customerId: customer.id, salesTableId: defaultSalesTableId, discountPercent: 0 });
      await submitProposalForApproval(context, proposal.id);
      const sale = await convertProposalToSale(context, proposal.id);

      const contextB: AccessContext = { userId: userB.id, organizationId: orgB.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };
      const orgBSales = await listSalesPaged(contextB, {});
      expect(orgBSales.items.map((s) => s.id)).not.toContain(sale.id);

      const orgBTimeline = await listSaleTimeline(orgB.id, { id: sale.id, proposalId: sale.proposalId, reservationId: sale.reservationId }, null);
      expect(orgBTimeline).toHaveLength(0); // eventos são da Org A, filtrados pelo organizationId da Org B
    } finally {
      await prisma.auditEvent.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.user.deleteMany({ where: { id: userB.id } });
      await prisma.organization.deleteMany({ where: { id: orgB.id } });
    }
  });
});
