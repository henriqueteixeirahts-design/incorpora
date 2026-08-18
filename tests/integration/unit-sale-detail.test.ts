import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { createUnit } from "@/server/units";
import { createCustomer } from "@/server/customers";
import { createBroker } from "@/server/crm";
import { createProposal } from "@/server/proposals";
import { getUnitSaleDetail } from "@/server/unit-sale-detail";

/**
 * Painel de detalhe do espelho de vendas (direção visual INCORPORA, rodada
 * 2) — cobre a query nova que junta contrato/cliente/comissão/carteira por
 * unidade, carregada sob demanda quando o usuário seleciona uma unidade com
 * contrato.
 */

let org: { id: string };
let otherOrg: { id: string };
let user: { id: string };
let context: AccessContext;
let unitWithContractId: string;
let unitWithoutContractId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org Espelho Detalhe" } });
  otherOrg = await prisma.organization.create({ data: { name: "Org Espelho Detalhe — outra" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "espelho-detalhe@teste.local", fullName: "Usuário Espelho Detalhe" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set() };

  const spe = await createSpe(context, {
    name: "SPE Espelho Detalhe",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-espelho-detalhe@teste.local",
    phone: "62999990010",
  });
  const development = await createDevelopment(context, {
    speId: spe.id,
    name: "Empreendimento Espelho Detalhe",
    type: "RESIDENTIAL_BUILDING",
  });
  const unitWithContract = await createUnit(context, {
    developmentId: development.id,
    unitType: "APARTMENT",
    number: "1101",
    referenceValue: 500000,
  });
  const unitWithoutContract = await createUnit(context, {
    developmentId: development.id,
    unitType: "APARTMENT",
    number: "1102",
    referenceValue: 480000,
  });
  unitWithContractId = unitWithContract.id;
  unitWithoutContractId = unitWithoutContract.id;

  const customer = await createCustomer(context, {
    type: "INDIVIDUAL",
    name: "Marina Ferreira Lopes",
    document: "02654427102",
    email: "marina-espelho-detalhe@teste.local",
    phone: "62999998801",
  });
  const broker = await createBroker(context, { name: "Íntegra Imóveis" });

  const proposal = await createProposal(context, {
    developmentId: development.id,
    unitId: unitWithContract.id,
    customerId: customer.id,
    discountPercent: 0,
  });

  const sale = await prisma.sale.create({
    data: {
      organizationId: org.id,
      developmentId: development.id,
      unitId: unitWithContract.id,
      proposalId: proposal.id,
      customerId: customer.id,
      saleNumber: "V-ESPELHO-DETALHE-0001",
      salePrice: 550000,
    },
  });

  await prisma.commissionSplit.create({
    data: {
      saleId: sale.id,
      beneficiaryType: "BROKER",
      brokerId: broker.id,
      percent: 4,
      value: 22000,
    },
  });

  const contract = await prisma.contract.create({
    data: {
      organizationId: org.id,
      developmentId: development.id,
      unitId: unitWithContract.id,
      saleId: sale.id,
      customerId: customer.id,
      contractNumber: "CT-ESPELHO-DETALHE-0001",
    },
  });

  const portfolio = await prisma.receivablePortfolio.create({
    data: { organizationId: org.id, contractId: contract.id, totalValue: 550000 },
  });

  await prisma.installment.create({
    data: {
      portfolioId: portfolio.id,
      sequence: 1,
      label: "Sinal",
      dueDate: new Date("2026-01-01"),
      originalValue: 110000,
      status: "PAID",
      paidAmount: 110000,
    },
  });
  for (let i = 0; i < 3; i += 1) {
    await prisma.installment.create({
      data: {
        portfolioId: portfolio.id,
        sequence: 2 + i,
        label: "Obra",
        dueDate: new Date(`2026-0${2 + i}-01`),
        originalValue: 10000,
        status: i === 0 ? "PAID" : "PENDING",
        paidAmount: i === 0 ? 10000 : 0,
      },
    });
  }
});

afterAll(async () => {
  const orgIds = [org.id, otherOrg.id];
  await prisma.installmentPayment.deleteMany({ where: { installment: { portfolio: { organizationId: { in: orgIds } } } } });
  await prisma.installment.deleteMany({ where: { portfolio: { organizationId: { in: orgIds } } } });
  await prisma.receivablePortfolio.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.contract.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.commissionSplit.deleteMany({ where: { sale: { organizationId: { in: orgIds } } } });
  await prisma.sale.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.proposalApproval.deleteMany({ where: { proposal: { organizationId: { in: orgIds } } } });
  await prisma.proposal.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.broker.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("getUnitSaleDetail", () => {
  it("retorna null pra unidade sem contrato", async () => {
    const detail = await getUnitSaleDetail(org.id, unitWithoutContractId);
    expect(detail).toBeNull();
  });

  it("retorna null quando a unidade tem contrato mas em outra organização", async () => {
    const detail = await getUnitSaleDetail(otherOrg.id, unitWithContractId);
    expect(detail).toBeNull();
  });

  it("junta cliente, comissão e carteira agrupada por rótulo de parcela", async () => {
    const detail = await getUnitSaleDetail(org.id, unitWithContractId);
    expect(detail).not.toBeNull();
    expect(detail!.customerName).toBe("Marina Ferreira Lopes");
    expect(detail!.salePrice).toBe(550000);
    expect(detail!.commission).toEqual({ beneficiaryName: "Íntegra Imóveis", percent: 4, value: 22000 });
    expect(detail!.installments).toEqual({ paidCount: 2, totalCount: 4, totalValue: 140000 });

    const obraGroup = detail!.installmentGroups.find((g) => g.label === "Obra");
    expect(obraGroup).toEqual({ label: "Obra", count: 3, paidCount: 1, value: 30000 });
    const sinalGroup = detail!.installmentGroups.find((g) => g.label === "Sinal");
    expect(sinalGroup).toEqual({ label: "Sinal", count: 1, paidCount: 1, value: 110000 });
  });
});
