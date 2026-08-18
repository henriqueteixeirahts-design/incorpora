import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { createUnit } from "@/server/units";
import { createCustomer } from "@/server/customers";
import { createSalesTable } from "@/server/sales-tables";
import { createProposal, getProposalReferenceData } from "@/server/proposals";
import { ValidationError } from "@/lib/errors";

/**
 * Regressão dos bugs bloqueantes do test drive em produção
 * (docs/RELATORIO_TESTDRIVE.md, P0 — B1/B2/B3), resolvidos pelo modal de
 * proposta novo: campo de % fora de faixa barrado com mensagem amigável
 * (nunca um erro cru de banco), e entrada+chaves nunca ultrapassa 100% do
 * valor da venda — entrada de 100% zera o pós-chaves, não herda o default
 * da tabela.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;
let salesTableId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Validação de Proposta" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "validacao-proposta@teste.local", fullName: "Usuário Validação Proposta" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set() };

  const spe = await createSpe(context, {
    name: "SPE Validação de Proposta",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-validacao-proposta@teste.local",
    phone: "62999990050",
  });
  const development = await createDevelopment(context, {
    speId: spe.id,
    name: "Empreendimento Validação de Proposta",
    type: "RESIDENTIAL_BUILDING",
  });
  developmentId = development.id;

  // Tabela com chaves de 80% — exatamente o cenário do test drive (B3):
  // entrada 100% + chaves herdado do default (80%) somava 180% da venda.
  const salesTable = await createSalesTable(context, {
    developmentId,
    name: "Tabela Validação de Proposta",
    downPaymentPercent: 20,
    monthlyInstallments: 10,
    keysInstallmentPercent: 80,
  });
  salesTableId = salesTable.id;
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.proposalApproval.deleteMany({ where: { proposal: { organizationId: { in: orgIds } } } });
  await prisma.proposal.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.salesTable.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("createProposal — validação de faixa do fluxo (B1)", () => {
  it("rejeita entrada fora de 0-100% com mensagem amigável, sem vazar erro de banco", async () => {
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "V101", referenceValue: 500000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente B1", document: "02654427102" });

    // Reprodução exata do test drive: usuário digitou "80000" (R$) num campo de %.
    await expect(
      createProposal(context, {
        developmentId,
        unitId: unit.id,
        customerId: customer.id,
        salesTableId,
        discountPercent: 0,
        proposedDownPaymentPercent: 80000,
      }),
    ).rejects.toThrow(ValidationError);

    await expect(
      createProposal(context, {
        developmentId,
        unitId: unit.id,
        customerId: customer.id,
        salesTableId,
        discountPercent: 0,
        proposedDownPaymentPercent: 80000,
      }),
    ).rejects.toThrow("Entrada deve estar entre 0% e 100%.");
  });

  it("rejeita chaves fora de 0-100%", async () => {
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "V102", referenceValue: 500000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente B1b", document: "11144477735" });

    await expect(
      createProposal(context, {
        developmentId,
        unitId: unit.id,
        customerId: customer.id,
        salesTableId,
        discountPercent: 0,
        proposedKeysInstallmentPercent: -10,
      }),
    ).rejects.toThrow("Chaves deve estar entre 0% e 100%.");
  });

  it("rejeita parcelas mensais negativas ou fracionárias", async () => {
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "V103", referenceValue: 500000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente B1c", document: "93664271050" });

    await expect(
      createProposal(context, {
        developmentId,
        unitId: unit.id,
        customerId: customer.id,
        salesTableId,
        discountPercent: 0,
        proposedMonthlyInstallments: -1,
      }),
    ).rejects.toThrow("Parcelas mensais deve ser um número inteiro não negativo.");
  });
});

describe("createProposal — entrada + chaves explícitas não ultrapassam 100% (B3)", () => {
  it("entrada e chaves explícitas somando mais de 100% são barradas com mensagem amigável", async () => {
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "V104", referenceValue: 500000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente B3a", document: "05192837465" });

    // Reprodução exata: entrada 100% explícita + chaves do default da tabela
    // (80%) — o modal novo sempre envia os dois valores juntos, então isso
    // nunca deveria acontecer pela UI, mas o servidor tem que barrar mesmo
    // assim (defesa em profundidade).
    await expect(
      createProposal(context, {
        developmentId,
        unitId: unit.id,
        customerId: customer.id,
        salesTableId,
        discountPercent: 0,
        proposedDownPaymentPercent: 100,
        proposedKeysInstallmentPercent: 80,
      }),
    ).rejects.toThrow("Entrada (100%) + Chaves (80%) não pode ultrapassar 100% do valor da venda.");
  });

  it("entrada de 100% com chaves explicitamente 0% calcula pós-chaves 0%, não o default da tabela (80%)", async () => {
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "V105", referenceValue: 500000 });
    const customer = await createCustomer(context, { type: "INDIVIDUAL", name: "Cliente B3b", document: "29384756012" });

    // Fluxo que o modal novo de fato envia: os três campos sempre explícitos
    // e coerentes (nunca "esquece" um campo pro fallback da tabela).
    const proposal = await createProposal(context, {
      developmentId,
      unitId: unit.id,
      customerId: customer.id,
      salesTableId,
      discountPercent: 0,
      proposedDownPaymentPercent: 100,
      proposedMonthlyInstallments: 0,
      proposedKeysInstallmentPercent: 0,
    });

    const checks = proposal.evaluationChecks as { downPaymentPercent: number; postKeysPercent: number };
    expect(checks.downPaymentPercent).toBe(100);
    expect(checks.postKeysPercent).toBe(0);
    // Conferido à mão: salePrice 500.000 × 100% = 500.000 de entrada, saldo e
    // chaves zerados — nenhum valor sobra pra pós-chaves.
    const proposedFlow = proposal.proposedPaymentFlow as { totalNominal: number };
    expect(proposedFlow.totalNominal).toBe(500000);
  });
});

describe("getProposalReferenceData — dados de referência do modal", () => {
  it("retorna preço de tabela, fluxo padrão e regra pra alimentar a prévia em tempo real do cliente", async () => {
    const unit = await createUnit(context, { developmentId, unitType: "APARTMENT", number: "V106", referenceValue: 500000 });

    const reference = await getProposalReferenceData(context, { developmentId, unitId: unit.id, salesTableId });

    expect(reference.listPrice).toBe(500000);
    expect(reference.standardFlow).toEqual({ downPaymentPercent: 20, monthlyInstallments: 10, keysInstallmentPercent: 80 });
    expect(reference.rule.minDownPaymentPercent).toBeGreaterThanOrEqual(0);
  });

  it("lança ValidationError pra unidade inválida", async () => {
    await expect(
      getProposalReferenceData(context, { developmentId, unitId: crypto.randomUUID(), salesTableId }),
    ).rejects.toThrow(ValidationError);
  });
});
