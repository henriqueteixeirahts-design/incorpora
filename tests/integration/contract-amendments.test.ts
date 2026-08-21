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
import { createAmendment, signAmendment, getRemainingBalance, listAmendments } from "@/server/contract-amendments";

/**
 * Fase A, etapa 4 (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md, Parte 2.2) —
 * aditivo contratual, com foco no rigor exigido pra reprogramação de
 * carteira na renegociação de fluxo: parcelas recebidas (total ou
 * parcialmente) NUNCA são alteradas, nada é apagado (só cancelado), e o
 * novo fluxo é conferido à mão, centavo a centavo.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;

async function setUpSignedContract(unitNumber: string, customerDocument: string) {
  const unit = await createUnit(context, {
    developmentId,
    unitType: "APARTMENT",
    number: unitNumber,
    referenceValue: 200000,
  });
  const customer = await createCustomer(context, {
    type: "INDIVIDUAL",
    name: `Cliente ${unitNumber}`,
    document: customerDocument,
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
  return contract;
}

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Aditivos" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "aditivos@teste.local", fullName: "Usuário Aditivos" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Aditivos",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-aditivos@teste.local",
    phone: "62999990100",
  });
  const development = await createDevelopment(context, {
    speId: spe.id,
    name: "Empreendimento Aditivos",
    type: "RESIDENTIAL_BUILDING",
  });
  developmentId = development.id;
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.contractAmendment.deleteMany({ where: { organizationId: { in: orgIds } } });
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
  it("gera CT-...-AD01, AD02... sequencial por contrato", async () => {
    const contract = await setUpSignedContract("AD101", "02654427102");

    const first = await createAmendment(context, contract.id, { type: "OTHER", notes: "Primeiro aditivo" });
    expect(first.amendmentNumber).toBe(`${contract.contractNumber}-AD01`);
    expect(first.sequenceNumber).toBe(1);

    const second = await createAmendment(context, contract.id, { type: "OTHER", notes: "Segundo aditivo" });
    expect(second.amendmentNumber).toBe(`${contract.contractNumber}-AD02`);
    expect(second.sequenceNumber).toBe(2);

    const list = await listAmendments(context, contract.id);
    expect(list.map((a) => a.amendmentNumber)).toEqual([first.amendmentNumber, second.amendmentNumber]);
  });

  it("aditivo só pode ser criado em contrato assinado (vigente)", async () => {
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "AD102", referenceValue: 100000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente Draft", document: "11144477735" });
    const salesTable = await createSalesTable(context, { developmentId, name: "Tabela Draft", downPaymentPercent: 20, monthlyInstallments: 2 });
    const proposal = await createProposal(context, { developmentId, unitId: unit.id, customerId: customer.id, salesTableId: salesTable.id, discountPercent: 0 });
    await submitProposalForApproval(context, proposal.id);
    const sale = await convertProposalToSale(context, proposal.id);
    const draftContract = await createContract(context, sale.id); // nunca assinado

    await expect(createAmendment(context, draftContract.id, { type: "OTHER" })).rejects.toThrow(/assinado/);
  });
});

describe("Renegociação de fluxo — reprogramação da carteira (rigor centavo a centavo)", () => {
  it("preserva intactas as parcelas recebidas (total e parcialmente), cancela (nunca apaga) as pendentes, e o novo fluxo bate com o cálculo manual", async () => {
    const contract = await setUpSignedContract("AD201", "96173820340");

    // Fluxo original: 200000, entrada 20% (40000) + 4 parcelas de 40000 —
    // 5 parcelas de R$ 40.000,00 cada, total R$ 200.000,00.
    const portfolioBefore = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: { orderBy: { sequence: "asc" } } },
    });
    expect(portfolioBefore.installments).toHaveLength(5);
    expect(portfolioBefore.installments.every((i) => Number(i.originalValue) === 40000)).toBe(true);
    expect(Number(portfolioBefore.totalValue)).toBe(200000);

    const entrada = portfolioBefore.installments[0]; // sequence 1, isDownPayment
    const parcela1 = portfolioBefore.installments[1]; // sequence 2
    const parcela2 = portfolioBefore.installments[2]; // sequence 3 — fica PENDING
    const parcela3 = portfolioBefore.installments[3]; // sequence 4 — fica PENDING
    const parcela4 = portfolioBefore.installments[4]; // sequence 5 — fica PENDING
    expect(entrada.isDownPayment).toBe(true);

    // Entrada paga integralmente.
    await registerInstallmentPayment(context, entrada.id, { amount: 40000, paidAt: new Date() });
    // Parcela 1 paga parcialmente (10000 de 40000).
    await registerInstallmentPayment(context, parcela1.id, { amount: 10000, paidAt: new Date() });

    const entradaAfterPayment = await prisma.installment.findUniqueOrThrow({ where: { id: entrada.id } });
    const parcela1AfterPayment = await prisma.installment.findUniqueOrThrow({ where: { id: parcela1.id } });
    expect(entradaAfterPayment.status).toBe("PAID");
    expect(parcela1AfterPayment.status).toBe("PARTIALLY_PAID");
    expect(Number(parcela1AfterPayment.paidAmount)).toBe(10000);

    // Saldo em aberto = só o que está PENDING/OVERDUE (parcela1 NÃO entra —
    // já recebeu algo, fica intocada até quitar por conta própria).
    const remainingBalance = await getRemainingBalance(context, contract.id);
    expect(remainingBalance).toBe(120000); // parcela2 + parcela3 + parcela4 = 3 x 40000

    // Renegocia o saldo em 2 parcelas de 60000 (em vez de 3 de 40000) — muda
    // de verdade a estrutura, não só reafirma o que já existia.
    const amendment = await createAmendment(context, contract.id, {
      type: "FLOW_RENEGOTIATION",
      downPaymentPercent: 0,
      monthlyInstallments: 2,
      keysInstallmentPercent: 0,
      notes: "Renegociação de teste",
    });
    expect(amendment.status).toBe("DRAFT");

    const flow = amendment.proposedPaymentFlow as unknown as { items: { label: string; amount: number; dueOffsetMonths: number }[] };
    // Conferido à mão: 120000 / 2 parcelas = 60000 exatas cada.
    expect(flow.items).toHaveLength(2);
    expect(flow.items[0]).toMatchObject({ amount: 60000, dueOffsetMonths: 1 });
    expect(flow.items[1]).toMatchObject({ amount: 60000, dueOffsetMonths: 2 });
    expect(flow.items.reduce((sum, i) => sum + i.amount, 0)).toBe(120000);

    const beforeSign = new Date();
    const signed = await signAmendment(context, amendment.id);
    const afterSign = new Date();
    expect(signed.status).toBe("SIGNED");
    expect(signed.signedAt).not.toBeNull();

    // --- Parcelas recebidas: intocadas, mesmo id, mesmos valores ---
    const entradaAfterSign = await prisma.installment.findUniqueOrThrow({ where: { id: entrada.id } });
    expect(entradaAfterSign.status).toBe("PAID");
    expect(Number(entradaAfterSign.originalValue)).toBe(40000);
    expect(Number(entradaAfterSign.paidAmount)).toBe(40000);

    const parcela1AfterSign = await prisma.installment.findUniqueOrThrow({ where: { id: parcela1.id } });
    expect(parcela1AfterSign.status).toBe("PARTIALLY_PAID");
    expect(Number(parcela1AfterSign.originalValue)).toBe(40000);
    expect(Number(parcela1AfterSign.paidAmount)).toBe(10000);

    // --- Parcelas pendentes: CANCELLED, nunca apagadas (ainda existem) ---
    for (const original of [parcela2, parcela3, parcela4]) {
      const afterSign = await prisma.installment.findUniqueOrThrow({ where: { id: original.id } });
      expect(afterSign.status).toBe("CANCELLED");
      expect(Number(afterSign.originalValue)).toBe(40000); // valor original preservado, não reescrito
    }

    // --- Novas parcelas: sequence continua do máximo anterior (nunca reaproveita) ---
    const portfolioAfter = await prisma.receivablePortfolio.findUniqueOrThrow({
      where: { id: portfolioBefore.id },
      include: { installments: { orderBy: { sequence: "asc" } } },
    });
    expect(portfolioAfter.installments).toHaveLength(7); // 5 originais + 2 novas (nenhuma apagada)

    const newInstallments = portfolioAfter.installments.filter((i) => i.sequence > 5);
    expect(newInstallments).toHaveLength(2);
    expect(newInstallments[0].sequence).toBe(6);
    expect(newInstallments[1].sequence).toBe(7);
    expect(newInstallments.every((i) => i.status === "PENDING")).toBe(true);
    expect(newInstallments.every((i) => Number(i.originalValue) === 60000)).toBe(true);

    // Datas relativas à assinatura DO ADITIVO (não do contrato original) —
    // conferido à mão: mês 1 e mês 2 a partir de `signedAt`.
    const expectedMonth1 = new Date(signed.signedAt!.getFullYear(), signed.signedAt!.getMonth() + 1, signed.signedAt!.getDate());
    const expectedMonth2 = new Date(signed.signedAt!.getFullYear(), signed.signedAt!.getMonth() + 2, signed.signedAt!.getDate());
    expect(newInstallments[0].dueDate.getTime()).toBe(expectedMonth1.getTime());
    expect(newInstallments[1].dueDate.getTime()).toBe(expectedMonth2.getTime());
    expect(signed.signedAt!.getTime()).toBeGreaterThanOrEqual(beforeSign.getTime());
    expect(signed.signedAt!.getTime()).toBeLessThanOrEqual(afterSign.getTime());

    // --- Total da carteira recomputado: preservadas (40000+40000) + novo fluxo (120000) = 200000 ---
    // Conferido à mão: nada se perde nem se ganha só de redistribuir o saldo.
    expect(Number(portfolioAfter.totalValue)).toBe(200000);
  });

  it("não permite renegociar fluxo quando não há saldo em aberto (carteira já quitada)", async () => {
    const contract = await setUpSignedContract("AD301", "50864238006");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    for (const installment of portfolio.installments) {
      await registerInstallmentPayment(context, installment.id, {
        amount: Number(installment.originalValue),
        paidAt: new Date(),
      });
    }

    await expect(
      createAmendment(context, contract.id, { type: "FLOW_RENEGOTIATION", monthlyInstallments: 2 }),
    ).rejects.toThrow(/saldo/);
  });

  it("não permite assinar o mesmo aditivo duas vezes", async () => {
    const contract = await setUpSignedContract("AD401", "72495130847");
    const amendment = await createAmendment(context, contract.id, { type: "OTHER" });
    await signAmendment(context, amendment.id);
    await expect(signAmendment(context, amendment.id)).rejects.toThrow(/já assinado/);
  });

  it("aditivos de outros tipos (alteração de unidade/prazo/outro) não mexem na carteira", async () => {
    const contract = await setUpSignedContract("AD501", "39053344705");
    const portfolioBefore = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });

    const amendment = await createAmendment(context, contract.id, { type: "TERM_CHANGE", notes: "Prazo de entrega adiado" });
    expect(amendment.proposedPaymentFlow).toBeNull();
    await signAmendment(context, amendment.id);

    const portfolioAfter = await prisma.receivablePortfolio.findFirstOrThrow({
      where: { contractId: contract.id },
      include: { installments: true },
    });
    expect(portfolioAfter.installments).toHaveLength(portfolioBefore.installments.length);
    expect(Number(portfolioAfter.totalValue)).toBe(Number(portfolioBefore.totalValue));
    for (const installment of portfolioBefore.installments) {
      const same = portfolioAfter.installments.find((i) => i.id === installment.id);
      expect(same?.status).toBe(installment.status);
    }
  });
});

describe("Isolamento entre organizações", () => {
  it("Org B não vê nem assina aditivo da Org A", async () => {
    const orgB = await prisma.organization.create({ data: { name: "Org B — Aditivos" } });
    const userB = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "org-b-aditivos@teste.local", fullName: "Usuário Org B" },
    });
    const contextB: AccessContext = { userId: userB.id, organizationId: orgB.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

    try {
      const contract = await setUpSignedContract("AD601", "02171922186");
      const amendment = await createAmendment(context, contract.id, { type: "OTHER" });

      await expect(signAmendment(contextB, amendment.id)).rejects.toThrow();

      const listB = await listAmendments(contextB, contract.id);
      expect(listB).toHaveLength(0);
    } finally {
      await prisma.auditEvent.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.user.deleteMany({ where: { id: userB.id } });
      await prisma.organization.deleteMany({ where: { id: orgB.id } });
    }
  });
});
