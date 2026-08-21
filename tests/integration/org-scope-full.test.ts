import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment, getDevelopment, updateDevelopment, deleteDevelopment } from "@/server/developments";
import { createUnit, updateUnitStatus } from "@/server/units";
import { createCustomer, getCustomerDetail, updateCustomer, deleteCustomer } from "@/server/customers";
import {
  createBroker,
  updateBroker,
  deleteBroker,
  createAgency,
  updateAgency,
  deleteAgency,
} from "@/server/crm";
import { createReservation } from "@/server/reservations";
import { createProposal, getProposal } from "@/server/proposals";
import { getSale } from "@/server/sales";
import { getContract } from "@/server/contracts";
import { registerInstallmentPayment } from "@/server/receivables";
import { createIndexRule, upsertIndexValue } from "@/server/index-rules";
import {
  createSupplier,
  updateSupplier,
  deleteSupplier,
  createCostCenter,
  updateCostCenter,
  deleteCostCenter,
} from "@/server/finance-setup";
import { createPayable, getPayableDetail, updatePayable, cancelPayable } from "@/server/payables";
import { createBankAccount, updateBankAccount, deleteBankAccount, linkSpeBankAccount } from "@/server/bank-accounts";

/**
 * Teste de fronteira pleno (Pilar 1.4, etapa 3 de
 * docs/ESPEC_MULTITENANT_FUNDACOES.md) — cobre todo módulo com dado
 * escopado por organização, não só os pontos que a etapa 2 corrigiu.
 * Complementa tests/integration/org-scope.test.ts (SPE/Proposta).
 *
 * Dois tipos de checagem por módulo:
 * 1. Leitura/edição/exclusão: Org B nunca acessa registro da Org A.
 * 2. Criação: Org B nunca consegue criar um registro seu apontando (via FK
 *    opcional) pra um recurso da Org A — bug de formato diferente do (1),
 *    encontrado na mesma auditoria.
 */

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string };
let userB: { id: string };
let contextA: AccessContext;
let contextB: AccessContext;

// Fixtures da Org A, construídos uma vez em beforeAll e reusados pelos testes de leitura/edição/exclusão.
let speA: Awaited<ReturnType<typeof createSpe>>;
let developmentA: Awaited<ReturnType<typeof createDevelopment>>;
let unitA: Awaited<ReturnType<typeof createUnit>>;
let customerA: Awaited<ReturnType<typeof createCustomer>>;
let brokerA: { id: string };
let agencyA: { id: string };
let supplierA: { id: string };
let costCenterA: Awaited<ReturnType<typeof createCostCenter>>;
let bankAccountA: Awaited<ReturnType<typeof createBankAccount>>;
let indexRuleA: { id: string };
let payableA: Awaited<ReturnType<typeof createPayable>>;
let proposalA: Awaited<ReturnType<typeof createProposal>>;
let saleA: { id: string };
let contractA: { id: string };
let installmentA: { id: string };

beforeAll(async () => {
  orgA = await prisma.organization.create({ data: { name: "Org A — Fronteira Plena" } });
  orgB = await prisma.organization.create({ data: { name: "Org B — Fronteira Plena" } });

  userA = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "org-a-plena@teste.local", fullName: "Usuário Org A" },
  });
  userB = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "org-b-plena@teste.local", fullName: "Usuário Org B" },
  });

  contextA = { userId: userA.id, organizationId: orgA.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };
  contextB = { userId: userB.id, organizationId: orgB.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  speA = await createSpe(contextA, {
    name: "SPE Fronteira Plena A",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-plena-a@teste.local",
    phone: "62999990010",
  });
  developmentA = await createDevelopment(contextA, {
    speId: speA.id,
    name: "Empreendimento Fronteira Plena A",
    type: "RESIDENTIAL_BUILDING",
  });
  unitA = await createUnit(contextA, {
    developmentId: developmentA.id,
    unitType: "APARTMENT",
    number: "101",
    referenceValue: 500000,
  });
  customerA = await createCustomer(contextA, {
    type: "INDIVIDUAL",
    name: "Cliente Fronteira Plena A",
    document: "02654427102",
    email: "cliente-plena-a@teste.local",
    phone: "62999998801",
  });
  brokerA = await createBroker(contextA, { name: "Corretor Fronteira Plena A" });
  agencyA = await createAgency(contextA, { name: "Imobiliária Fronteira Plena A" });
  supplierA = await createSupplier(contextA, { name: "Fornecedor Fronteira Plena A" });
  costCenterA = await createCostCenter(contextA, { name: "Centro de Custo Fronteira Plena A" });
  bankAccountA = await createBankAccount(contextA, {
    bankName: "341 - Itaú",
    agency: "1234",
    account: "56789-0",
    type: "CHECKING",
    status: "ACTIVE",
  });
  indexRuleA = await createIndexRule(contextA, { code: "IPCA", name: "IPCA Fronteira Plena A" });
  payableA = await createPayable(contextA, {
    category: "ADMINISTRATION",
    description: "Despesa Fronteira Plena A",
    competenceDate: new Date("2026-01-01"),
    dueDate: new Date("2026-02-01"),
    amount: 1000,
  });

  proposalA = await createProposal(contextA, {
    developmentId: developmentA.id,
    unitId: unitA.id,
    customerId: customerA.id,
    discountPercent: 0,
  });

  // Sale/Contract/Portfolio/Installment: criados direto via Prisma pra não
  // precisar rodar o fluxo completo de aprovação/assinatura só pra ter uma
  // linha existente — o objetivo aqui é testar o ESCOPO das funções de
  // leitura/edição, não a lógica de negócio da criação (essa é o alvo da
  // suíte de regressão de fluxo, tests/integration/full-flow.test.ts).
  const sale = await prisma.sale.create({
    data: {
      organizationId: orgA.id,
      developmentId: developmentA.id,
      unitId: unitA.id,
      proposalId: proposalA.id,
      customerId: customerA.id,
      saleNumber: "V-TEST-0001",
      salePrice: 500000,
    },
  });
  saleA = sale;

  const contract = await prisma.contract.create({
    data: {
      organizationId: orgA.id,
      developmentId: developmentA.id,
      unitId: unitA.id,
      saleId: sale.id,
      customerId: customerA.id,
      contractNumber: "CT-2026-TESTE-A",
    },
  });
  contractA = contract;

  const portfolio = await prisma.receivablePortfolio.create({
    data: { organizationId: orgA.id, contractId: contract.id, totalValue: 500000 },
  });
  const installment = await prisma.installment.create({
    data: {
      portfolioId: portfolio.id,
      sequence: 1,
      label: "Parcela única",
      dueDate: new Date("2026-03-01"),
      originalValue: 500000,
    },
  });
  installmentA = installment;
});

afterAll(async () => {
  const orgIds = [orgA.id, orgB.id];
  await prisma.installmentPayment.deleteMany({ where: { installment: { portfolio: { organizationId: { in: orgIds } } } } });
  await prisma.financialCalculation.deleteMany({ where: { installment: { portfolio: { organizationId: { in: orgIds } } } } });
  await prisma.installment.deleteMany({ where: { portfolio: { organizationId: { in: orgIds } } } });
  await prisma.receivablePortfolio.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.contract.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.sale.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.reservation.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.proposalApproval.deleteMany({ where: { proposal: { organizationId: { in: orgIds } } } });
  await prisma.proposal.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.commissionSplit.deleteMany({ where: { sale: { organizationId: { in: orgIds } } } });
  await prisma.payable.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.broker.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.realEstateAgency.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.supplier.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.costCenter.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.speBankAccount.deleteMany({ where: { spe: { organizationId: { in: orgIds } } } });
  await prisma.bankAccount.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.indexValue.deleteMany({ where: { indexRule: { organizationId: { in: orgIds } } } });
  await prisma.indexRule.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.developmentEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("Development — Org B não acessa o empreendimento da Org A", () => {
  it("bloqueia get/update/delete", async () => {
    expect(await getDevelopment(contextB, developmentA.id)).toBeNull();
    await expect(
      updateDevelopment(contextB, developmentA.id, { speId: speA.id, name: "Sequestro", type: "RESIDENTIAL_BUILDING" }),
    ).rejects.toThrow("Empreendimento não encontrado.");
    await expect(deleteDevelopment(contextB, developmentA.id)).rejects.toThrow();
  });
});

describe("Unit — Org B não altera status de unidade da Org A", () => {
  it("bloqueia updateUnitStatus", async () => {
    await expect(updateUnitStatus(contextB, unitA.id, "IN_SERVICE")).rejects.toThrow("Unidade inválida.");
  });
});

describe("Customer — Org B não acessa cliente da Org A", () => {
  it("bloqueia get/update/delete", async () => {
    expect(await getCustomerDetail(orgB.id, customerA.id)).toBeNull();
    await expect(
      updateCustomer(contextB, customerA.id, { type: "INDIVIDUAL", name: "Sequestro", document: "02654427102" }),
    ).rejects.toThrow("Cliente não encontrado.");
    await expect(deleteCustomer(contextB, customerA.id)).rejects.toThrow("Cliente não encontrado.");
  });
});

describe("Broker / RealEstateAgency — Org B não acessa registros da Org A", () => {
  it("bloqueia update/delete de corretor e imobiliária", async () => {
    await expect(updateBroker(contextB, brokerA.id, { name: "Sequestro" })).rejects.toThrow("Corretor não encontrado.");
    await expect(deleteBroker(contextB, brokerA.id)).rejects.toThrow("Corretor não encontrado.");
    await expect(updateAgency(contextB, agencyA.id, { name: "Sequestro" })).rejects.toThrow(
      "Imobiliária não encontrada.",
    );
    await expect(deleteAgency(contextB, agencyA.id)).rejects.toThrow("Imobiliária não encontrada.");

    const listA = await prisma.broker.findMany({ where: { organizationId: orgB.id } });
    expect(listA.find((b) => b.id === brokerA.id)).toBeUndefined();
  });
});

describe("Reservation — Org B não cria reserva referenciando unidade/cliente/corretor/imobiliária da Org A", () => {
  it("bloqueia createReservation apontando pra recursos da Org A", async () => {
    // unidade da Org A
    await expect(
      createReservation(contextB, {
        unitId: unitA.id,
        customerId: customerA.id,
        expiresAt: new Date(Date.now() + 86400000),
      }),
    ).rejects.toThrow("Unidade inválida.");

    // Cria unidade própria da Org B pra isolar os demais testes de FK cruzada
    const speB = await createSpe(contextB, {
      name: "SPE Fronteira Plena B",
      document: "46127017000105",
      status: "ACTIVE",
      email: "spe-plena-b@teste.local",
      phone: "62999990011",
    });
    const developmentB = await createDevelopment(contextB, {
      speId: speB.id,
      name: "Empreendimento Fronteira Plena B",
      type: "RESIDENTIAL_BUILDING",
    });
    const unitB = await createUnit(contextB, {
      developmentId: developmentB.id,
      unitType: "APARTMENT",
      number: "201",
      referenceValue: 300000,
    });

    // unidade própria, cliente da Org A
    await expect(
      createReservation(contextB, {
        unitId: unitB.id,
        customerId: customerA.id,
        expiresAt: new Date(Date.now() + 86400000),
      }),
    ).rejects.toThrow("Cliente inválido.");

    // unidade e cliente próprios, corretor da Org A
    const customerB = await createCustomer(contextB, {
      type: "INDIVIDUAL",
      name: "Cliente Fronteira Plena B",
      document: "11144477735",
      email: "cliente-plena-b@teste.local",
      phone: "62999998802",
    });
    await expect(
      createReservation(contextB, {
        unitId: unitB.id,
        customerId: customerB.id,
        brokerId: brokerA.id,
        expiresAt: new Date(Date.now() + 86400000),
      }),
    ).rejects.toThrow("Corretor inválido.");

    // Confirma que nenhuma reserva cross-org foi criada
    const leaked = await prisma.reservation.findFirst({ where: { unitId: unitA.id, organizationId: orgB.id } });
    expect(leaked).toBeNull();

    // cleanup local (não coberto pelo afterAll, que só limpa fixtures nomeados acima)
    await prisma.unit.deleteMany({ where: { developmentId: developmentB.id } });
    await prisma.developmentEvent.deleteMany({ where: { developmentId: developmentB.id } });
    await prisma.auditEvent.deleteMany({ where: { entityId: { in: [developmentB.id, speB.id, customerB.id] } } });
    await prisma.development.delete({ where: { id: developmentB.id } });
    await prisma.specialPurposeEntity.delete({ where: { id: speB.id } });
    await prisma.customer.delete({ where: { id: customerB.id } });
  });
});

describe("Proposal / Sale / Contract / Installment — Org B não lê registro da Org A", () => {
  it("bloqueia getProposal/getSale/getContract/registerInstallmentPayment", async () => {
    expect(await getProposal(contextB, proposalA.id)).toBeNull();
    expect(await getSale(contextB, saleA.id)).toBeNull();
    expect(await getContract(contextB, contractA.id)).toBeNull();
    await expect(
      registerInstallmentPayment(contextB, installmentA.id, { amount: 500000, paidAt: new Date() }),
    ).rejects.toThrow("Parcela inválida.");

    // Confirma que a parcela real não foi paga pela tentativa
    const stillPending = await prisma.installment.findUnique({ where: { id: installmentA.id } });
    expect(stillPending?.status).toBe("PENDING");
  });
});

describe("IndexRule — Org B não altera índice da Org A", () => {
  it("bloqueia upsertIndexValue", async () => {
    await expect(
      upsertIndexValue(contextB, { indexRuleId: indexRuleA.id, referenceMonth: new Date("2026-01-01"), ratePercent: 999 }),
    ).rejects.toThrow("Índice inválido.");
  });
});

describe("Supplier / CostCenter — Org B não acessa, e não cria centro de custo apontando pra empreendimento da Org A", () => {
  it("bloqueia update/delete de fornecedor e centro de custo", async () => {
    await expect(updateSupplier(contextB, supplierA.id, { name: "Sequestro" })).rejects.toThrow(
      "Fornecedor não encontrado.",
    );
    await expect(deleteSupplier(contextB, supplierA.id)).rejects.toThrow("Fornecedor não encontrado.");
    await expect(updateCostCenter(contextB, costCenterA.id, { name: "Sequestro" })).rejects.toThrow(
      "Centro de custo não encontrado.",
    );
    await expect(deleteCostCenter(contextB, costCenterA.id)).rejects.toThrow("Centro de custo não encontrado.");
  });

  it("bloqueia createCostCenter apontando developmentId da Org A", async () => {
    await expect(
      createCostCenter(contextB, { name: "Centro de custo suspeito", developmentId: developmentA.id }),
    ).rejects.toThrow("Empreendimento inválido.");
  });
});

describe("BankAccount — Org B não acessa conta bancária central da Org A", () => {
  it("bloqueia update/delete e o vínculo com SPE de outra organização", async () => {
    await expect(updateBankAccount(contextB, bankAccountA.id, { bankName: "Sequestro", agency: "0000", account: "0000", type: "CHECKING", status: "ACTIVE" })).rejects.toThrow(
      "Conta bancária não encontrada.",
    );
    await expect(deleteBankAccount(contextB, bankAccountA.id)).rejects.toThrow("Conta bancária não encontrada.");
    await expect(linkSpeBankAccount(contextB, speA.id, bankAccountA.id, false)).rejects.toThrow();
  });
});

describe("Payable — Org B não acessa, e não cria conta a pagar apontando pra recursos da Org A", () => {
  it("bloqueia get/update/cancel", async () => {
    expect(await getPayableDetail(contextB, payableA.id)).toBeNull();
    await expect(
      updatePayable(contextB, payableA.id, {
        category: "ADMINISTRATION",
        description: "Sequestro",
        competenceDate: new Date(),
        dueDate: new Date(),
        amount: 1,
      }),
    ).rejects.toThrow("Conta a pagar não encontrada.");
    await expect(cancelPayable(contextB, payableA.id)).rejects.toThrow("Conta a pagar inválida.");
  });

  it("bloqueia createPayable apontando FKs da Org A", async () => {
    await expect(
      createPayable(contextB, {
        developmentId: developmentA.id,
        category: "ADMINISTRATION",
        description: "Despesa suspeita",
        competenceDate: new Date(),
        dueDate: new Date(),
        amount: 100,
      }),
    ).rejects.toThrow("Empreendimento inválido.");
    await expect(
      createPayable(contextB, {
        supplierId: supplierA.id,
        category: "ADMINISTRATION",
        description: "Despesa suspeita",
        competenceDate: new Date(),
        dueDate: new Date(),
        amount: 100,
      }),
    ).rejects.toThrow("Fornecedor inválido.");
  });
});
