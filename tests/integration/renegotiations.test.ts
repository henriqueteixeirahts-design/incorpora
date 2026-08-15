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
import { upsertRenegotiationRule } from "@/server/renegotiation-rules";
import {
  createRenegotiationAgreement,
  decideRenegotiationApproval,
  signRenegotiationAgreement,
  checkAndUpdateBrokenAgreementsForCustomer,
  getRenegotiation,
} from "@/server/renegotiations";

/**
 * Fase B, etapa 3 (docs/ESPEC_FASE_B_CARTEIRA_FINANCEIRO_1.md, Parte 2) —
 * renegociação de parcelas: acordo estruturado sobre dívida vencida/a
 * vencer (diferente do aditivo de renegociação de fluxo da Fase A, que
 * redesenha o fluxo futuro inteiro). Rigor centavo a centavo pedido
 * explicitamente pelo usuário: consolidado (principal corrigido + multa/
 * mora) conferido à mão, desconto só sobre encargos, alçada por
 * empreendimento, parcelas originais nunca apagadas, acordo quebrado.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;
let customerSeq = 0;

function nextDocument() {
  customerSeq += 1;
  return `5${String(customerSeq).padStart(10, "0")}`;
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function setUpSignedContract(unitNumber: string) {
  const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: unitNumber, referenceValue: 200000 });
  const customer = await createCustomer(context, { type: "INDIVIDUAL", name: `Cliente ${unitNumber}`, document: nextDocument() });
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
  org = await prisma.organization.create({ data: { name: "Org — Renegociações" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "renegociacoes@teste.local", fullName: "Usuário Renegociações" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set() };

  const spe = await createSpe(context, {
    name: "SPE Renegociações",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-renegociacoes@teste.local",
    phone: "62999990100",
  });
  const development = await createDevelopment(context, { speId: spe.id, name: "Empreendimento Renegociações", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.renegotiationApproval.deleteMany({ where: { agreement: { organizationId: { in: orgIds } } } });
  await prisma.renegotiationAgreement.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.renegotiationRule.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
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

describe("Consolidado — rigor centavo a centavo", () => {
  it("soma principal corrigido + encargos (multa/mora) das parcelas selecionadas, desconto só sobre encargos", async () => {
    const { contract } = await setUpSignedContract("RN101");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
    const parcelas = portfolio.installments.filter((i) => !i.isDownPayment).sort((a, b) => a.sequence - b.sequence);

    // Parcela 1: vencida há 30 dias (sem índice cadastrado, corrigido = nominal).
    await prisma.installment.update({ where: { id: parcelas[0].id }, data: { dueDate: daysAgo(30) } });
    // Parcela 2: vencida há 60 dias.
    await prisma.installment.update({ where: { id: parcelas[1].id }, data: { dueDate: daysAgo(60) } });

    const agreementDate = new Date();
    const agreement = await createRenegotiationAgreement(context, contract.id, {
      installmentIds: [parcelas[0].id, parcelas[1].id],
      agreementDate,
      chargesDiscountPercent: 50,
      monthlyInstallments: 3,
      applyFutureCorrection: true,
    });

    // Parcela 1 (30 dias): multa 40000*2%=800; mora 40000*1%*(30/30)=400. Total encargos=1200.
    // Parcela 2 (60 dias): multa 800; mora 40000*1%*(60/30)=800. Total encargos=1600.
    // consolidatedCharges = 1200+1600 = 2800. consolidatedPrincipal = 40000+40000 = 80000 (sem índice).
    expect(Number(agreement.consolidatedPrincipal)).toBe(80000);
    expect(Number(agreement.consolidatedCharges)).toBe(2800);
    // Desconto 50% sobre 2800 = 1400. finalValue = 80000 + 2800 - 1400 = 81400.
    expect(Number(agreement.chargesDiscountAmount)).toBe(1400);
    expect(Number(agreement.finalValue)).toBe(81400);
    expect(agreement.agreementNumber).toBe(`${contract.contractNumber}-RN01`);
    expect(agreement.status).toBe("PENDING_APPROVAL"); // 50% > tolerância default de 20% -> precisa de alçada
  });

  it("desconto dentro da tolerância não precisa de alçada — status DRAFT direto, assinável", async () => {
    const { contract } = await setUpSignedContract("RN102");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
    const parcela = portfolio.installments.find((i) => !i.isDownPayment)!;
    await prisma.installment.update({ where: { id: parcela.id }, data: { dueDate: daysAgo(10) } });

    const agreement = await createRenegotiationAgreement(context, contract.id, {
      installmentIds: [parcela.id],
      agreementDate: new Date(),
      chargesDiscountPercent: 10, // dentro dos 20% default
      monthlyInstallments: 2,
      applyFutureCorrection: true,
    });
    expect(agreement.status).toBe("DRAFT");

    const signed = await signRenegotiationAgreement(context, agreement.id);
    expect(signed.status).toBe("SIGNED");
  });
});

describe("Bloqueios de negócio", () => {
  it("rejeita renegociar parcela já parcialmente paga", async () => {
    const { contract } = await setUpSignedContract("RN201");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
    const parcela = portfolio.installments.find((i) => !i.isDownPayment)!;
    await registerInstallmentPayment(context, parcela.id, { amount: 5000, paidAt: new Date() });

    await expect(
      createRenegotiationAgreement(context, contract.id, {
        installmentIds: [parcela.id],
        agreementDate: new Date(),
        chargesDiscountPercent: 0,
        monthlyInstallments: 1,
        applyFutureCorrection: true,
      }),
    ).rejects.toThrow(/em aberto/);
  });

  it("rejeita prazo de reparcelamento acima do teto do empreendimento", async () => {
    const spe = await prisma.development.findFirstOrThrow({ where: { id: developmentId } });
    const shortTermDev = await createDevelopment(context, { speId: spe.speId, name: "Dev prazo curto", type: "RESIDENTIAL_BUILDING" });
    await upsertRenegotiationRule(context, shortTermDev.id, {
      maxDiscountOnChargesPercent: 20,
      maxTermMonths: 3,
      brokenDealGraceDays: 15,
      reactivateOriginalOnBreak: false,
      approvalLevels: ["SALES_MANAGER"],
    });

    const savedDevelopmentId = developmentId;
    developmentId = shortTermDev.id;
    const { contract } = await setUpSignedContract("RN202");
    developmentId = savedDevelopmentId;

    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
    const parcela = portfolio.installments.find((i) => !i.isDownPayment)!;

    await expect(
      createRenegotiationAgreement(context, contract.id, {
        installmentIds: [parcela.id],
        agreementDate: new Date(),
        chargesDiscountPercent: 0,
        monthlyInstallments: 6,
        applyFutureCorrection: true,
      }),
    ).rejects.toThrow(/prazo/i);
  });

  it("não permite assinar acordo ainda em aprovação", async () => {
    const { contract } = await setUpSignedContract("RN203");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
    const parcela = portfolio.installments.find((i) => !i.isDownPayment)!;
    await prisma.installment.update({ where: { id: parcela.id }, data: { dueDate: daysAgo(10) } });

    const agreement = await createRenegotiationAgreement(context, contract.id, {
      installmentIds: [parcela.id],
      agreementDate: new Date(),
      chargesDiscountPercent: 90, // força alçada
      monthlyInstallments: 2,
      applyFutureCorrection: true,
    });
    expect(agreement.status).toBe("PENDING_APPROVAL");

    await expect(signRenegotiationAgreement(context, agreement.id)).rejects.toThrow(/aprovação/);
  });
});

describe("Alçada", () => {
  it("aprovado no nível configurado libera pra assinatura", async () => {
    const { contract } = await setUpSignedContract("RN301");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
    const parcela = portfolio.installments.find((i) => !i.isDownPayment)!;
    await prisma.installment.update({ where: { id: parcela.id }, data: { dueDate: daysAgo(10) } });

    const agreement = await createRenegotiationAgreement(context, contract.id, {
      installmentIds: [parcela.id],
      agreementDate: new Date(),
      chargesDiscountPercent: 80,
      monthlyInstallments: 2,
      applyFutureCorrection: true,
    });
    expect(agreement.status).toBe("PENDING_APPROVAL");

    const decided = await decideRenegotiationApproval(context, agreement.id, "SALES_MANAGER", "APPROVED");
    expect(decided.status).toBe("DRAFT");

    const signed = await signRenegotiationAgreement(context, agreement.id);
    expect(signed.status).toBe("SIGNED");
  });

  it("rejeição de qualquer nível bloqueia o acordo permanentemente", async () => {
    const { contract } = await setUpSignedContract("RN302");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
    const parcela = portfolio.installments.find((i) => !i.isDownPayment)!;
    await prisma.installment.update({ where: { id: parcela.id }, data: { dueDate: daysAgo(10) } });

    const agreement = await createRenegotiationAgreement(context, contract.id, {
      installmentIds: [parcela.id],
      agreementDate: new Date(),
      chargesDiscountPercent: 80,
      monthlyInstallments: 2,
      applyFutureCorrection: true,
    });

    const decided = await decideRenegotiationApproval(context, agreement.id, "SALES_MANAGER", "REJECTED", "Desconto alto demais");
    expect(decided.status).toBe("REJECTED");

    await expect(signRenegotiationAgreement(context, agreement.id)).rejects.toThrow();
  });
});

describe("Assinar — parcelas originais nunca apagadas, novas continuam sequence", () => {
  it("parcelas de origem viram CANCELLED (preservadas), destino nasce com sequence contínua e correctionExempt correto", async () => {
    const { contract } = await setUpSignedContract("RN401");
    const portfolioBefore = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
    const maxSequenceBefore = portfolioBefore.installments.reduce((max, i) => Math.max(max, i.sequence), 0);
    const parcela = portfolioBefore.installments.find((i) => !i.isDownPayment)!;
    const originalValue = Number(parcela.originalValue);
    await prisma.installment.update({ where: { id: parcela.id }, data: { dueDate: daysAgo(5) } });

    const agreement = await createRenegotiationAgreement(context, contract.id, {
      installmentIds: [parcela.id],
      agreementDate: new Date(),
      chargesDiscountPercent: 0,
      monthlyInstallments: 2,
      applyFutureCorrection: false, // "sem correção futura"
    });
    await signRenegotiationAgreement(context, agreement.id);

    const originAfter = await prisma.installment.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(originAfter.status).toBe("CANCELLED");
    expect(Number(originAfter.originalValue)).toBe(originalValue); // nunca apagada, valor preservado
    expect(originAfter.originAgreementId).toBe(agreement.id);

    const portfolioAfter = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
    expect(portfolioAfter.installments).toHaveLength(portfolioBefore.installments.length + 2); // 2 novas parcelas do acordo

    const destination = portfolioAfter.installments.filter((i) => i.destinationAgreementId === agreement.id);
    expect(destination).toHaveLength(2);
    expect(destination.every((i) => i.sequence > maxSequenceBefore)).toBe(true);
    expect(destination.every((i) => i.correctionExempt === true)).toBe(true);
    expect(destination.reduce((sum, i) => sum + Number(i.originalValue), 0)).toBeCloseTo(Number(agreement.finalValue), 2);
  });
});

describe("Acordo quebrado", () => {
  it("marca BROKEN após o prazo de tolerância sem reativar condições originais (regra default)", async () => {
    const { contract, customer } = await setUpSignedContract("RN501");
    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
    const parcela = portfolio.installments.find((i) => !i.isDownPayment)!;
    await prisma.installment.update({ where: { id: parcela.id }, data: { dueDate: daysAgo(5) } });

    const agreement = await createRenegotiationAgreement(context, contract.id, {
      installmentIds: [parcela.id],
      agreementDate: new Date(),
      chargesDiscountPercent: 0,
      monthlyInstallments: 1,
      applyFutureCorrection: true,
    });
    const signed = await signRenegotiationAgreement(context, agreement.id);

    // A única parcela nova vence em 1 mês — simula quebra colocando o vencimento há mais de 15 dias (default) no passado.
    const portfolioAfter = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
    const destination = portfolioAfter.installments.find((i) => i.destinationAgreementId === signed.id)!;
    await prisma.installment.update({ where: { id: destination.id }, data: { dueDate: daysAgo(20) } });

    const result = await checkAndUpdateBrokenAgreementsForCustomer(org.id, customer.id);
    expect(result.brokenCount).toBe(1);

    const broken = await getRenegotiation(org.id, agreement.id);
    expect(broken!.status).toBe("BROKEN");
    expect(broken!.reactivatedOriginal).toBe(false);

    // Sem reativação: parcela de origem continua CANCELLED, destino continua como estava (PENDING).
    const originAfter = await prisma.installment.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(originAfter.status).toBe("CANCELLED");
  });

  it("reativa condições originais quando a regra do empreendimento manda", async () => {
    const spe = await prisma.development.findFirstOrThrow({ where: { id: developmentId } });
    const reactivateDev = await createDevelopment(context, { speId: spe.speId, name: "Dev reativa", type: "RESIDENTIAL_BUILDING" });
    await upsertRenegotiationRule(context, reactivateDev.id, {
      maxDiscountOnChargesPercent: 20,
      maxTermMonths: 24,
      brokenDealGraceDays: 10,
      reactivateOriginalOnBreak: true,
      approvalLevels: ["SALES_MANAGER"],
    });

    const savedDevelopmentId = developmentId;
    developmentId = reactivateDev.id;
    const { contract, customer } = await setUpSignedContract("RN502");
    developmentId = savedDevelopmentId;

    const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
    const parcela = portfolio.installments.find((i) => !i.isDownPayment)!;
    await prisma.installment.update({ where: { id: parcela.id }, data: { dueDate: daysAgo(5) } });

    const agreement = await createRenegotiationAgreement(context, contract.id, {
      installmentIds: [parcela.id],
      agreementDate: new Date(),
      chargesDiscountPercent: 0,
      monthlyInstallments: 1,
      applyFutureCorrection: true,
    });
    const signed = await signRenegotiationAgreement(context, agreement.id);

    const portfolioAfter = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
    const destination = portfolioAfter.installments.find((i) => i.destinationAgreementId === signed.id)!;
    await prisma.installment.update({ where: { id: destination.id }, data: { dueDate: daysAgo(15) } });

    await checkAndUpdateBrokenAgreementsForCustomer(org.id, customer.id);

    const broken = await getRenegotiation(org.id, agreement.id);
    expect(broken!.status).toBe("BROKEN");
    expect(broken!.reactivatedOriginal).toBe(true);

    const originAfter = await prisma.installment.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(originAfter.status).toBe("OVERDUE"); // volta a existir em aberto, já vencida

    const destinationAfter = await prisma.installment.findUniqueOrThrow({ where: { id: destination.id } });
    expect(destinationAfter.status).toBe("CANCELLED"); // parcela do acordo cancelada, nunca apagada
  });
});

describe("Isolamento entre organizações", () => {
  it("Org B não vê nem assina acordo da Org A", async () => {
    const orgB = await prisma.organization.create({ data: { name: "Org B — Renegociações" } });
    const userB = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "org-b-renegociacoes@teste.local", fullName: "Usuário Org B" },
    });
    const contextB: AccessContext = { userId: userB.id, organizationId: orgB.id, roleNames: [], permissions: new Set() };

    try {
      const { contract } = await setUpSignedContract("RN601");
      const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({ where: { contractId: contract.id }, include: { installments: true } });
      const parcela = portfolio.installments.find((i) => !i.isDownPayment)!;
      const agreement = await createRenegotiationAgreement(context, contract.id, {
        installmentIds: [parcela.id],
        agreementDate: new Date(),
        chargesDiscountPercent: 0,
        monthlyInstallments: 1,
        applyFutureCorrection: true,
      });

      await expect(signRenegotiationAgreement(contextB, agreement.id)).rejects.toThrow();
      expect(await getRenegotiation(orgB.id, agreement.id)).toBeNull();
    } finally {
      await prisma.auditEvent.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.user.deleteMany({ where: { id: userB.id } });
      await prisma.organization.deleteMany({ where: { id: orgB.id } });
    }
  });
});
