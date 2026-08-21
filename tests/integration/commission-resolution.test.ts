import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { createUnit } from "@/server/units";
import { createCustomer } from "@/server/customers";
import { createBroker, createAgency } from "@/server/crm";
import { createSalesTable } from "@/server/sales-tables";
import { createProposal, submitProposalForApproval } from "@/server/proposals";
import { convertProposalToSale, setSaleInternalManager } from "@/server/sales";
import { createContract, markAwaitingSignature, confirmSignature } from "@/server/contracts";
import { upsertCommissionRule } from "@/server/commission-rules";
import { upsertSplitTiers } from "@/server/agency-split-tiers";

/**
 * docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Etapa 4 — resolução das duas
 * naturezas no fechamento da venda + fracionamento de parcelas. Cobre os
 * casos de teste obrigatórios 1 (autônomo), 2/3 (split com/sem gerente),
 * 4 (fracionamento ao centavo) e 5 (comissão interna, ALL_SALES vs
 * PARTICIPATED_ONLY).
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;
let seq = 0;

async function setUpSale(params: {
  salePriceUnit?: number;
  downPaymentPercent: number;
  monthlyInstallments: number;
  brokerId?: string;
  agencyId?: string;
}) {
  seq += 1;
  const unit = await createUnit(context, {
    developmentId,
    unitType: "APARTMENT",
    number: `CR-${seq}`,
    referenceValue: params.salePriceUnit ?? 200000,
  });
  const customer = await createCustomer(context, {
    type: "INDIVIDUAL",
    name: `Cliente Resolução ${seq}`,
    document: `${10000000000 + seq}`.slice(0, 11),
  });
  const salesTable = await createSalesTable(context, {
    developmentId,
    name: `Tabela Resolução ${seq}`,
    downPaymentPercent: params.downPaymentPercent,
    monthlyInstallments: params.monthlyInstallments,
  });
  const proposal = await createProposal(context, {
    developmentId,
    unitId: unit.id,
    customerId: customer.id,
    salesTableId: salesTable.id,
    brokerId: params.brokerId,
    agencyId: params.agencyId,
    discountPercent: 0,
  });
  await submitProposalForApproval(context, proposal.id);
  const sale = await convertProposalToSale(context, proposal.id);
  const contract = await createContract(context, sale.id);
  await markAwaitingSignature(context, contract.id);
  return { unit, customer, salesTable, proposal, sale, contract };
}

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Resolução de Comissão" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "resolucao-comissao@teste.local", fullName: "Usuário Resolução" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Resolução de Comissão", document: "63265390000141", status: "ACTIVE",
    email: "spe-resolucao@teste.local", phone: "62999990091",
  });
  const development = await createDevelopment(context, { speId: spe.id, name: "Empreendimento Resolução", type: "RESIDENTIAL_BUILDING" });
  developmentId = development.id;
});

afterAll(async () => {
  const orgIds = [org.id];
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
  await prisma.agencySplitTier.deleteMany({ where: { agency: { organizationId: { in: orgIds } } } });
  await prisma.broker.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.realEstateAgency.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.commissionRule.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("Caso 1 — corretor autônomo recebe 100% da comissão externa", () => {
  it("cria um único ExternalCommissionSplit de 100%", async () => {
    await upsertCommissionRule(context, developmentId, {
      externalCommissionPercent: 6, internalCommissionPercent: null, internalCommissionAppliesTo: "ALL_SALES", internalManagerBrokerId: null,
    });
    const broker = await createBroker(context, { name: "Corretor Autônomo Caso1" });

    const { sale } = await setUpSale({ downPaymentPercent: 20, monthlyInstallments: 5, brokerId: broker.id });

    const splits = await prisma.externalCommissionSplit.findMany({ where: { saleId: sale.id } });
    expect(splits).toHaveLength(1);
    expect(splits[0].percent.toString()).toBe("100");
    expect(Number(splits[0].value)).toBe(12000); // 6% de 200.000
    expect(splits[0].brokerId).toBe(broker.id);
  });
});

describe("Casos 2/3 — split 5-vias da imobiliária, com e sem gerente direto", () => {
  it("corretor COM gerente: 5 destinatários somando o total exato", async () => {
    await upsertCommissionRule(context, developmentId, {
      externalCommissionPercent: 6, internalCommissionPercent: null, internalCommissionAppliesTo: "ALL_SALES", internalManagerBrokerId: null,
    });
    const agency = await createAgency(context, { name: "Imobiliária Caso 2" });
    const regional = await createBroker(context, { name: "Gerente Regional Caso2", role: "MANAGER" });
    const produto = await createBroker(context, { name: "Gerente Produto Caso2", role: "MANAGER" });
    const manager = await createBroker(context, { name: "Gerente Direto Caso2", role: "MANAGER", agencyId: agency.id });
    const broker = await createBroker(context, { name: "Corretor Caso2", agencyId: agency.id, managerId: manager.id });

    await upsertSplitTiers(context, agency.id, [
      { label: "Corretor", percent: 20, kind: "DYNAMIC_BROKER_OF_SALE" },
      { label: "Gerente direto", percent: 10, kind: "DYNAMIC_MANAGER_OF_BROKER" },
      { label: "Gerente de produto", percent: 5, kind: "FIXED_BROKER", fixedBrokerId: produto.id },
      { label: "Gerente regional", percent: 5, kind: "FIXED_BROKER", fixedBrokerId: regional.id },
      { label: "Imobiliária", percent: 60, kind: "FIXED_AGENCY" },
    ]);

    const { sale } = await setUpSale({ downPaymentPercent: 20, monthlyInstallments: 5, brokerId: broker.id, agencyId: agency.id });

    const splits = await prisma.externalCommissionSplit.findMany({ where: { saleId: sale.id } });
    expect(splits).toHaveLength(5);
    const total = splits.reduce((acc, s) => acc + Number(s.value), 0);
    expect(Math.round(total * 100) / 100).toBe(12000); // 6% de 200.000, centavo a centavo

    const brokerSplit = splits.find((s) => s.brokerId === broker.id && s.percent.toString() === "20")!;
    expect(brokerSplit).toBeTruthy();
    const managerSplit = splits.find((s) => s.brokerId === manager.id)!;
    expect(managerSplit.percent.toString()).toBe("10");
  });

  it("corretor SEM gerente: fatia soma no corretor, 4 destinatários", async () => {
    await upsertCommissionRule(context, developmentId, {
      externalCommissionPercent: 6, internalCommissionPercent: null, internalCommissionAppliesTo: "ALL_SALES", internalManagerBrokerId: null,
    });
    const agency = await createAgency(context, { name: "Imobiliária Caso 3" });
    const regional = await createBroker(context, { name: "Gerente Regional Caso3", role: "MANAGER" });
    const produto = await createBroker(context, { name: "Gerente Produto Caso3", role: "MANAGER" });
    const broker = await createBroker(context, { name: "Corretor Caso3", agencyId: agency.id });

    await upsertSplitTiers(context, agency.id, [
      { label: "Corretor", percent: 20, kind: "DYNAMIC_BROKER_OF_SALE" },
      { label: "Gerente direto", percent: 10, kind: "DYNAMIC_MANAGER_OF_BROKER" },
      { label: "Gerente de produto", percent: 5, kind: "FIXED_BROKER", fixedBrokerId: produto.id },
      { label: "Gerente regional", percent: 5, kind: "FIXED_BROKER", fixedBrokerId: regional.id },
      { label: "Imobiliária", percent: 60, kind: "FIXED_AGENCY" },
    ]);

    const { sale } = await setUpSale({ downPaymentPercent: 20, monthlyInstallments: 5, brokerId: broker.id, agencyId: agency.id });

    const splits = await prisma.externalCommissionSplit.findMany({ where: { saleId: sale.id } });
    expect(splits).toHaveLength(4);
    const brokerSplit = splits.find((s) => s.brokerId === broker.id)!;
    expect(brokerSplit.percent.toString()).toBe("30");
  });
});

describe("Caso 4 — fracionamento de parcelas ao centavo", () => {
  it("comissão maior que a 1a parcela: consome inteira + fraciona a 2a", async () => {
    // Comissão (25%) > entrada (20%) de propósito, pra forçar o
    // fracionamento além da 1a parcela sem mexer no down payment padrão
    // (que precisa ficar em 20% pra a proposta aprovar automaticamente —
    // down payment baixo demais dispara avaliação manual, fora do escopo
    // deste teste).
    await upsertCommissionRule(context, developmentId, {
      externalCommissionPercent: 25, internalCommissionPercent: null, internalCommissionAppliesTo: "ALL_SALES", internalManagerBrokerId: null,
    });
    const broker = await createBroker(context, { name: "Corretor Caso4" });

    // Preço 200.000, comissão = 50.000. Entrada 20% = 40.000 (< comissão,
    // consumida inteira); resto (10.000) fraciona a 1a parcela mensal.
    const { sale, contract } = await setUpSale({ downPaymentPercent: 20, monthlyInstallments: 5, brokerId: broker.id });

    await confirmSignature(context, contract.id);

    const portfolio = await prisma.receivablePortfolio.findUnique({
      where: { contractId: contract.id },
      include: { installments: { orderBy: { sequence: "asc" } } },
    });
    expect(portfolio).toBeTruthy();

    const totalExternalPortion = portfolio!.installments.reduce((acc, i) => acc + Number(i.externalCommissionPortion), 0);
    const totalCommission = (await prisma.externalCommissionSplit.findMany({ where: { saleId: sale.id } }))
      .reduce((acc, s) => acc + Number(s.value), 0);
    expect(Math.round(totalExternalPortion * 100) / 100).toBe(Math.round(totalCommission * 100) / 100);

    // 1a parcela (entrada, 10.000) totalmente consumida.
    const first = portfolio!.installments[0];
    expect(Number(first.externalCommissionPortion)).toBe(Number(first.originalValue));

    // Existe uma parcela-fronteira parcialmente consumida (0 < portion < originalValue).
    const boundary = portfolio!.installments.find(
      (i) => Number(i.externalCommissionPortion) > 0 && Number(i.externalCommissionPortion) < Number(i.originalValue),
    );
    expect(boundary).toBeTruthy();

    // Todas as parcelas continuam na carteira (não excluídas, diferente do modelo legado).
    expect(portfolio!.installments.length).toBe(6); // entrada + 5 mensais
  });
});

describe("Caso 5 — comissão interna (Natureza 2), ALL_SALES vs PARTICIPATED_ONLY", () => {
  it("ALL_SALES com gerente padrão configurado: cria o split interno", async () => {
    const manager = await createBroker(context, { name: "Gerente Interno ALL_SALES", role: "MANAGER" });
    await upsertCommissionRule(context, developmentId, {
      externalCommissionPercent: null, internalCommissionPercent: 2, internalCommissionAppliesTo: "ALL_SALES", internalManagerBrokerId: manager.id,
    });
    const broker = await createBroker(context, { name: "Corretor Caso5a" });

    const { sale, contract } = await setUpSale({ downPaymentPercent: 20, monthlyInstallments: 5, brokerId: broker.id });
    await confirmSignature(context, contract.id);

    const splits = await prisma.commissionSplit.findMany({ where: { saleId: sale.id, beneficiaryType: "MANAGER" } });
    expect(splits).toHaveLength(1);
    expect(splits[0].brokerId).toBe(manager.id);
    expect(Number(splits[0].value)).toBe(4000); // 2% de 200.000
    expect(Number(splits[0].accruedAmount)).toBe(0);
  });

  it("PARTICIPATED_ONLY sem gerente creditado na venda: não cria split interno", async () => {
    await upsertCommissionRule(context, developmentId, {
      externalCommissionPercent: null, internalCommissionPercent: 2, internalCommissionAppliesTo: "PARTICIPATED_ONLY", internalManagerBrokerId: null,
    });
    const broker = await createBroker(context, { name: "Corretor Caso5b" });

    const { sale, contract } = await setUpSale({ downPaymentPercent: 20, monthlyInstallments: 5, brokerId: broker.id });
    await confirmSignature(context, contract.id);

    const splits = await prisma.commissionSplit.findMany({ where: { saleId: sale.id, beneficiaryType: "MANAGER" } });
    expect(splits).toHaveLength(0);
  });

  it("PARTICIPATED_ONLY com gerente creditado via setSaleInternalManager: cria o split", async () => {
    const manager = await createBroker(context, { name: "Gerente Interno PARTICIPATED", role: "MANAGER" });
    await upsertCommissionRule(context, developmentId, {
      externalCommissionPercent: null, internalCommissionPercent: 2, internalCommissionAppliesTo: "PARTICIPATED_ONLY", internalManagerBrokerId: null,
    });
    const broker = await createBroker(context, { name: "Corretor Caso5c" });

    const { sale, contract } = await setUpSale({ downPaymentPercent: 20, monthlyInstallments: 5, brokerId: broker.id });
    await setSaleInternalManager(context, sale.id, manager.id);
    await confirmSignature(context, contract.id);

    const splits = await prisma.commissionSplit.findMany({ where: { saleId: sale.id, beneficiaryType: "MANAGER" } });
    expect(splits).toHaveLength(1);
    expect(splits[0].brokerId).toBe(manager.id);
  });
});
