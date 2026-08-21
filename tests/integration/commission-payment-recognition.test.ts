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
import { upsertCommissionRule } from "@/server/commission-rules";
import { settleInternalCommissions, listUnsettledInternalCommissions } from "@/server/commissions";

/**
 * docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Etapa 5 — reconhecimento
 * proporcional no pagamento (regime caixa) + liquidação consolidada da
 * comissão interna. Cobre o caso de teste obrigatório 4 (regime caixa: cada
 * beneficiário recebe conforme o cliente paga) e 5 (comissão interna,
 * acúmulo + consolidação, sem Payable por parcela).
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Reconhecimento de Pagamento" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "reconhecimento-pagamento@teste.local", fullName: "Usuário Reconhecimento" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Reconhecimento", document: "63265390000141", status: "ACTIVE",
    email: "spe-reconhecimento@teste.local", phone: "62999990092",
  });
  const development = await createDevelopment(context, { speId: spe.id, name: "Empreendimento Reconhecimento", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;

  await upsertCommissionRule(context, developmentId, {
    externalCommissionPercent: 25, internalCommissionPercent: 2, internalCommissionAppliesTo: "ALL_SALES", internalManagerBrokerId: null,
  });
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.commissionSplitPayable.deleteMany({ where: { split: { sale: { organizationId: { in: orgIds } } } } });
  await prisma.payable.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.supplier.deleteMany({ where: { organizationId: { in: orgIds } } });
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

describe("Regime caixa — reconhecimento proporcional a cada pagamento", () => {
  it("entrada quitada de uma vez: reconhece 100% dela, sem passar do teto da parcela em pagamentos parciais posteriores", async () => {
    const manager = await createBroker(context, { name: "Gerente Interno Reconhecimento", role: "MANAGER" });
    await upsertCommissionRule(context, developmentId, {
      externalCommissionPercent: 25, internalCommissionPercent: 2, internalCommissionAppliesTo: "ALL_SALES", internalManagerBrokerId: manager.id,
    });
    const broker = await createBroker(context, { name: "Corretor Reconhecimento" });

    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "REC-1", referenceValue: 200000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente Reconhecimento", document: "11122233344" });
    const salesTable = await createSalesTable(context, {
      developmentId, name: "Tabela Reconhecimento", downPaymentPercent: 20, monthlyInstallments: 5,
    });
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
    const entrada = portfolio.installments[0]; // 40.000, totalmente consumida (comissão total 50.000)
    const boundary = portfolio.installments[1]; // parcela mensal 32.000, fronteira parcial (10.000 de portion)
    expect(Number(entrada.originalValue)).toBe(40000);
    expect(Number(entrada.externalCommissionPortion)).toBe(40000);
    expect(Number(boundary.externalCommissionPortion)).toBe(10000);

    // Paga a entrada inteira de uma vez.
    await registerInstallmentPayment(context, entrada.id, { amount: 40000, paidAt: new Date() });

    const [split] = await prisma.externalCommissionSplit.findMany({ where: { saleId: sale.id } });
    expect(Number(split.paidAmount)).toBe(40000);
    expect(split.status).toBe("PARTIALLY_PAID"); // total da comissão é 50.000

    const internalAfterEntrada = await prisma.commissionSplit.findFirst({ where: { saleId: sale.id, beneficiaryType: "MANAGER" } });
    expect(Number(internalAfterEntrada!.accruedAmount)).toBe(800); // 2% de 40.000 — base é o valor TOTAL pago, não só a fatia SPE

    // Paga a parcela-fronteira em duas parcelas de 16.000 cada — reconhecimento
    // não pode passar do teto (10.000) mesmo com dois eventos de pagamento.
    await registerInstallmentPayment(context, boundary.id, { amount: 16000, paidAt: new Date() });
    const boundaryAfterFirst = await prisma.installment.findUniqueOrThrow({ where: { id: boundary.id } });
    expect(Number(boundaryAfterFirst.externalCommissionRecognized)).toBe(5000); // 16.000 * (10.000/32.000)

    await registerInstallmentPayment(context, boundary.id, { amount: 16000, paidAt: new Date() });
    const boundaryAfterSecond = await prisma.installment.findUniqueOrThrow({ where: { id: boundary.id } });
    expect(Number(boundaryAfterSecond.externalCommissionRecognized)).toBe(10000); // nunca passa do portion

    const [splitFinal] = await prisma.externalCommissionSplit.findMany({ where: { saleId: sale.id } });
    expect(Number(splitFinal.paidAmount)).toBe(50000); // 40.000 + 10.000 = teto exato
    expect(splitFinal.status).toBe("PAID");

    const internalFinal = await prisma.commissionSplit.findFirst({ where: { saleId: sale.id, beneficiaryType: "MANAGER" } });
    expect(Number(internalFinal!.accruedAmount)).toBe(1440); // 2% de (40.000+16.000+16.000)

    // --- Liquidação consolidada ---
    const unsettledBefore = await listUnsettledInternalCommissions(context);
    const managerRow = unsettledBefore.find((r) => r.brokerId === manager.id)!;
    expect(managerRow.unsettled).toBe(1440);

    const payable = await settleInternalCommissions(context, manager.id);
    expect(Number(payable.amount)).toBe(1440);

    const internalAfterSettle = await prisma.commissionSplit.findFirst({ where: { saleId: sale.id, beneficiaryType: "MANAGER" } });
    expect(Number(internalAfterSettle!.settledAmount)).toBe(1440);

    // Rodar de novo sem nada de novo acumulado: nada pra liquidar.
    await expect(settleInternalCommissions(context, manager.id)).rejects.toThrow("Não há comissão interna acumulada");

    // Acumula mais (paga mais uma parcela mensal inteira) e liquida de novo —
    // consolidação continua funcionando após a primeira rodada, um Payable
    // novo por rodada, não reabre a liquidação anterior.
    const thirdInstallment = portfolio.installments[2];
    await registerInstallmentPayment(context, thirdInstallment.id, { amount: Number(thirdInstallment.originalValue), paidAt: new Date() });

    const unsettledAfterMore = await listUnsettledInternalCommissions(context);
    const managerRowAfterMore = unsettledAfterMore.find((r) => r.brokerId === manager.id)!;
    expect(managerRowAfterMore.unsettled).toBe(640); // 2% de 32.000

    const payable2 = await settleInternalCommissions(context, manager.id);
    expect(Number(payable2.amount)).toBe(640);
    expect(payable2.id).not.toBe(payable.id);

    const splitPayables = await prisma.commissionSplitPayable.findMany({ where: { split: { saleId: sale.id } } });
    expect(splitPayables).toHaveLength(2); // uma linha por rodada de liquidação
  });
});
