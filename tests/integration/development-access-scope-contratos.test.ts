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
import { createContract, markAwaitingSignature, confirmSignature, getContract, getContractBySale } from "@/server/contracts";
import { registerInstallmentPayment, recalculatePortfolio, simulateFullSettlement } from "@/server/receivables";
import { createAmendment, listAmendments, getRemainingBalance } from "@/server/contract-amendments";
import { createAssignment } from "@/server/contract-assignments";
import { createDistrato } from "@/server/contract-distratos";
import { createRenegotiationAgreement } from "@/server/renegotiations";

/**
 * docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 2.5 — teste de fronteira pro
 * escopo por EMPREENDIMENTO nos módulos de Contratos/Financeiro (Fase A/B):
 * um usuário (ex.: corretor) com `AccessGrant` restrito ao Development X não
 * deve ver/alterar nada de um contrato — nem aditivo, cessão, distrato,
 * renegociação ou carteira de recebíveis — do Development Y, mesmo os dois
 * pertencendo à mesma organização. Resposta esperada em todo caso: "não
 * encontrado"/lista vazia, ou a mesma mensagem de erro genérica já usada
 * pro isolamento por organização ("Contrato inválido." etc.) — nunca "sem
 * permissão" (não confirma a um usuário sem acesso que o registro existe
 * fora do alcance dele). Mesmo padrão de
 * tests/integration/development-access-scope.test.ts (módulo de referência
 * Unit/Development).
 */

let org: { id: string };
let adminUser: { id: string };
let restrictedUser: { id: string };
let contextFull: AccessContext; // acesso "ALL" — não deveria ser afetado por nada aqui
let contextRestricted: AccessContext; // developmentAccess = Set([devX.id]) só
let devX: { id: string };
let devY: { id: string };

let contractY: { id: string; contractNumber: string };
let saleY: { id: string };
let installmentY: { id: string };
let portfolioY: { id: string };
let draftSaleY: { id: string }; // venda em devY sem contrato ainda, pra testar createContract

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Escopo por Empreendimento (Contratos)" } });
  adminUser = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "admin-escopo-contratos@teste.local", fullName: "Admin Escopo Contratos" },
  });
  restrictedUser = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "corretor-escopo-contratos@teste.local", fullName: "Corretor Restrito Contratos" },
  });
  contextFull = { userId: adminUser.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(contextFull, {
    name: "SPE Escopo Contratos", document: "63265390000141", status: "ACTIVE",
    email: "spe-escopo-contratos@teste.local", phone: "62999990400",
  });
  devX = await createDevelopment(contextFull, { speId: spe.id, name: "Development X — Contratos", type: "RESIDENTIAL_BUILDING" });
  devY = await createDevelopment(contextFull, { speId: spe.id, name: "Development Y — Contratos", type: "RESIDENTIAL_BUILDING" });

  // Corretor com AccessGrant restrito só ao Development X.
  contextRestricted = {
    userId: restrictedUser.id,
    organizationId: org.id,
    roleNames: [],
    permissions: new Set(),
    developmentAccess: new Set([devX.id]),
  };

  // Contrato assinado no Development Y (fora do escopo do corretor).
  const unit = await createUnit(contextFull, { developmentId: devY.id, unitType: "APARTMENT", number: "Y-CT-101", referenceValue: 200000 });
  const customer = await createCustomer(contextFull, { type: "INDIVIDUAL", name: "Cliente Y Contratos", document: "02654427102" });
  const salesTable = await createSalesTable(contextFull, { developmentId: devY.id, name: "Tabela Y Contratos", downPaymentPercent: 20, monthlyInstallments: 4 });
  const proposal = await createProposal(contextFull, { developmentId: devY.id, unitId: unit.id, customerId: customer.id, salesTableId: salesTable.id, discountPercent: 0 });
  await submitProposalForApproval(contextFull, proposal.id);
  saleY = await convertProposalToSale(contextFull, proposal.id);
  contractY = await createContract(contextFull, saleY.id);
  await markAwaitingSignature(contextFull, contractY.id);
  await confirmSignature(contextFull, contractY.id);

  const portfolio = await prisma.receivablePortfolio.findFirstOrThrow({
    where: { contractId: contractY.id },
    include: { installments: { orderBy: { sequence: "asc" } } },
  });
  portfolioY = { id: portfolio.id };
  installmentY = { id: portfolio.installments.find((i) => !i.isDownPayment)!.id };

  // Segunda venda em Y, ainda sem contrato — pra testar createContract.
  const unit2 = await createUnit(contextFull, { developmentId: devY.id, unitType: "APARTMENT", number: "Y-CT-102", referenceValue: 200000 });
  const customer2 = await createCustomer(contextFull, { type: "INDIVIDUAL", name: "Cliente Y2 Contratos", document: "96173820340" });
  const proposal2 = await createProposal(contextFull, { developmentId: devY.id, unitId: unit2.id, customerId: customer2.id, salesTableId: salesTable.id, discountPercent: 0 });
  await submitProposalForApproval(contextFull, proposal2.id);
  draftSaleY = await convertProposalToSale(contextFull, proposal2.id);
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.renegotiationApproval.deleteMany({ where: { agreement: { organizationId: { in: orgIds } } } });
  await prisma.renegotiationAgreement.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.contractAssignment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.contractDistrato.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.contractAmendment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.installmentPayment.deleteMany({ where: { installment: { portfolio: { organizationId: { in: orgIds } } } } });
  await prisma.financialCalculation.deleteMany({ where: { installment: { portfolio: { organizationId: { in: orgIds } } } } });
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
  await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, restrictedUser.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("Contract — usuário restrito não vê/altera contrato fora do escopo", () => {
  it("getContract: null pro Y, retorna normalmente pro X (via contextFull)", async () => {
    expect(await getContract(contextRestricted, contractY.id)).toBeNull();
    expect(await getContract(contextFull, contractY.id)).not.toBeNull();
  });

  it("getContractBySale: null pro Y", async () => {
    expect(await getContractBySale(contextRestricted, saleY.id)).toBeNull();
    expect(await getContractBySale(contextFull, saleY.id)).not.toBeNull();
  });

  it("createContract: rejeita criar contrato pra venda do Y", async () => {
    await expect(createContract(contextRestricted, draftSaleY.id)).rejects.toThrow("Venda inválida.");
    const leaked = await prisma.contract.findUnique({ where: { saleId: draftSaleY.id } });
    expect(leaked).toBeNull();
  });
});

describe("Aditivo — usuário restrito não cria/lista aditivo do Y", () => {
  it("createAmendment: rejeita pro Y", async () => {
    await expect(
      createAmendment(contextRestricted, contractY.id, { type: "OTHER", notes: "Sequestro" }),
    ).rejects.toThrow("Contrato inválido.");
  });

  it("listAmendments: lista vazia pro Y (mesmo com aditivo criado por contextFull)", async () => {
    const amendment = await createAmendment(contextFull, contractY.id, { type: "OTHER", notes: "Legítimo" });
    expect(await listAmendments(contextRestricted, contractY.id)).toEqual([]);
    const fullList = await listAmendments(contextFull, contractY.id);
    expect(fullList.map((a) => a.id)).toContain(amendment.id);
  });

  it("getRemainingBalance: 0 pro Y (não vaza o saldo real)", async () => {
    const restrictedBalance = await getRemainingBalance(contextRestricted, contractY.id);
    const fullBalance = await getRemainingBalance(contextFull, contractY.id);
    expect(restrictedBalance).toBe(0);
    expect(fullBalance).toBeGreaterThan(0);
  });
});

describe("Cessão — usuário restrito não cria cessão do Y", () => {
  it("createAssignment: rejeita pro Y", async () => {
    const cessionario = await createCustomer(contextFull, { type: "INDIVIDUAL", name: "Cessionário Y", document: "50864238006" });
    await expect(
      createAssignment(contextRestricted, contractY.id, { newCustomerId: cessionario.id, assignmentDate: new Date() }),
    ).rejects.toThrow("Contrato inválido.");
  });
});

describe("Distrato — usuário restrito não cria distrato do Y", () => {
  it("createDistrato: rejeita pro Y", async () => {
    await expect(
      createDistrato(contextRestricted, contractY.id, { refundDueDate: new Date() }),
    ).rejects.toThrow("Contrato inválido.");
    const leaked = await prisma.contractDistrato.findFirst({ where: { contractId: contractY.id } });
    expect(leaked).toBeNull();
  });
});

describe("Renegociação — usuário restrito não cria acordo do Y", () => {
  it("createRenegotiationAgreement: rejeita pro Y", async () => {
    await expect(
      createRenegotiationAgreement(contextRestricted, contractY.id, {
        installmentIds: [installmentY.id],
        agreementDate: new Date(),
        chargesDiscountPercent: 0,
        monthlyInstallments: 1,
        applyFutureCorrection: true,
      }),
    ).rejects.toThrow("Contrato inválido.");
  });
});

describe("Carteira/parcela — usuário restrito não vê/altera recebíveis do Y", () => {
  it("registerInstallmentPayment: rejeita pro Y", async () => {
    await expect(
      registerInstallmentPayment(contextRestricted, installmentY.id, { amount: 1000, paidAt: new Date() }),
    ).rejects.toThrow("Parcela inválida.");

    const stillPending = await prisma.installment.findUniqueOrThrow({ where: { id: installmentY.id } });
    expect(Number(stillPending.paidAmount)).toBe(0);
  });

  it("recalculatePortfolio: rejeita pro Y", async () => {
    await expect(recalculatePortfolio(contextRestricted, portfolioY.id)).rejects.toThrow("Carteira inválida.");
  });

  it("simulateFullSettlement: rejeita pro Y", async () => {
    await expect(simulateFullSettlement(contextRestricted, contractY.id, new Date())).rejects.toThrow("Contrato inválido.");
    const full = await simulateFullSettlement(contextFull, contractY.id, new Date());
    expect(full.items.length).toBeGreaterThan(0);
  });
});

describe("Regressão — acesso 'ALL' continua funcionando normalmente no Y", () => {
  it("contextFull continua acessando contrato, aditivos e carteira do Y", async () => {
    expect(await getContract(contextFull, contractY.id)).not.toBeNull();
    expect(await getContractBySale(contextFull, saleY.id)).not.toBeNull();
    const amendments = await listAmendments(contextFull, contractY.id);
    expect(amendments.length).toBeGreaterThan(0);
    await expect(recalculatePortfolio(contextFull, portfolioY.id)).resolves.toBeUndefined();
  });
});
