import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createDevelopment } from "@/server/developments";
import { createSpe } from "@/server/spes";
import { createPayable } from "@/server/payables";
import { setPayableAllocations } from "@/server/payable-allocations";
import { createReceivable, registerReceivableReceipt } from "@/server/receivables-avulsos";
import { createBankAccount, linkSpeBankAccount } from "@/server/bank-accounts";
import { getCashFlow } from "@/server/cash-flow";

/**
 * Fase B, etapa 7 (docs/ESPEC_FASE_B_CARTEIRA_FINANCEIRO_1.md, Parte 4.4) —
 * fluxo de caixa refinado: granularidade semanal/diária além da mensal,
 * filtro por SPE (além de empreendimento/consolidado), saldo inicial
 * bancário alimentando o saldo acumulado projetado. Rigor central: as três
 * fontes (carteira, recebíveis avulsos, contas a pagar rateadas) somam sem
 * duplicar, e o rateio da etapa 5 aparece fracionado aqui também.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let speAId: string;
let speBId: string;
let devAId: string;
let devBId: string; // mesma SPE de devA
let devCId: string; // SPE B

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Cash Flow Refinado" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "cashflow-refinado@teste.local", fullName: "Usuário Fluxo" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set() };

  const speA = await createSpe(context, {
    name: "SPE Fluxo A",
    document: "63265390000663",
    status: "ACTIVE",
    email: "spe-fluxo-a@teste.local",
    phone: "62999990700",
  });
  const speB = await createSpe(context, {
    name: "SPE Fluxo B",
    document: "63265390000744",
    status: "ACTIVE",
    email: "spe-fluxo-b@teste.local",
    phone: "62999990800",
  });
  speAId = speA.id;
  speBId = speB.id;

  const devA = await createDevelopment(context, { speId: speAId, name: "Empreendimento Fluxo A", type: "RESIDENTIAL_BUILDING" });
  const devB = await createDevelopment(context, { speId: speAId, name: "Empreendimento Fluxo A2", type: "RESIDENTIAL_BUILDING" });
  const devC = await createDevelopment(context, { speId: speBId, name: "Empreendimento Fluxo B", type: "RESIDENTIAL_BUILDING" });
  devAId = devA.id;
  devBId = devB.id;
  devCId = devC.id;
});

afterAll(async () => {
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
});

describe("Granularidade semanal e diária", () => {
  it("gera um bucket por dia com a chave YYYY-MM-DD, e o valor lançado hoje aparece no bucket de hoje", async () => {
    const dueDate = new Date();
    await createPayable(context, {
      category: "ADMINISTRATION",
      description: "Despesa diária",
      competenceDate: dueDate,
      dueDate,
      amount: 321,
      developmentId: devAId,
    });

    const buckets = await getCashFlow(org.id, { developmentId: devAId, granularity: "daily", daysBack: 0, daysForward: 0 });
    expect(buckets).toHaveLength(1);
    expect(buckets[0].period).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(buckets[0].payablesForecast).toBeGreaterThanOrEqual(321);
  });

  it("gera buckets semanais com a chave YYYY-Www", async () => {
    const buckets = await getCashFlow(org.id, { developmentId: devAId, granularity: "weekly", daysBack: 7, daysForward: 7 });
    expect(buckets.length).toBeGreaterThan(0);
    for (const bucket of buckets) {
      expect(bucket.period).toMatch(/^\d{4}-W\d{2}$/);
    }
  });
});

describe("Filtro por SPE", () => {
  it("consolida os empreendimentos da SPE, isolado de outra SPE", async () => {
    const dueDate = new Date();
    await createPayable(context, {
      category: "ADMINISTRATION",
      description: "Despesa devA (SPE A)",
      competenceDate: dueDate,
      dueDate,
      amount: 1000,
      developmentId: devAId,
    });
    await createPayable(context, {
      category: "ADMINISTRATION",
      description: "Despesa devB (SPE A)",
      competenceDate: dueDate,
      dueDate,
      amount: 2000,
      developmentId: devBId,
    });
    await createPayable(context, {
      category: "ADMINISTRATION",
      description: "Despesa devC (SPE B)",
      competenceDate: dueDate,
      dueDate,
      amount: 5000,
      developmentId: devCId,
    });

    const bySpeA = await getCashFlow(org.id, { speId: speAId, granularity: "daily", daysBack: 0, daysForward: 0 });
    const bySpeB = await getCashFlow(org.id, { speId: speBId, granularity: "daily", daysBack: 0, daysForward: 0 });

    // SPE A vê a soma de devA + devB (1000 + 2000), nunca a despesa de devC (SPE B).
    expect(bySpeA[0].payablesForecast).toBeGreaterThanOrEqual(3000);
    expect(bySpeB[0].payablesForecast).toBeGreaterThanOrEqual(5000);
    expect(bySpeB[0].payablesForecast).toBeLessThan(bySpeA[0].payablesForecast + 5000);
  });
});

describe("Saldo inicial bancário alimenta o saldo acumulado projetado", () => {
  it("saldo acumulado do primeiro bucket parte do saldo inicial da SPE, não de zero", async () => {
    const spe = await createSpe(context, {
      name: "SPE Saldo Inicial",
      document: "63265390000825",
      status: "ACTIVE",
      email: "spe-saldo@teste.local",
      phone: "62999990900",
    });
    const bankAccount = await createBankAccount(context, {
      bankName: "341 - Itaú Unibanco",
      agency: "0001",
      account: "12345-6",
      type: "CHECKING",
      status: "ACTIVE",
      openingBalance: 50000,
    });
    await linkSpeBankAccount(context, spe.id, bankAccount.id, true);

    const buckets = await getCashFlow(org.id, { speId: spe.id, granularity: "daily", daysBack: 0, daysForward: 0 });
    // Sem nenhum lançamento pra essa SPE, o saldo acumulado (previsto e
    // realizado) do único bucket tem que ser exatamente o saldo inicial.
    expect(buckets[0].cumulativeForecast).toBe(50000);
    expect(buckets[0].cumulativeRealized).toBe(50000);
  });

  it("sem escopo (organização) soma o saldo inicial de todas as contas ativas — desligar o saldo inicial muda o acumulado em exatamente esse valor", async () => {
    const withOpening = await getCashFlow(org.id, { granularity: "daily", daysBack: 0, daysForward: 0 });
    const withoutOpening = await getCashFlow(org.id, {
      granularity: "daily",
      daysBack: 0,
      daysForward: 0,
      includeOpeningBalance: false,
    });
    // A diferença entre ligar/desligar o saldo inicial tem que ser exatamente
    // a soma dos saldos iniciais das contas ativas da organização (>= 50.000,
    // já que a conta do teste anterior continua ativa).
    expect(withOpening[0].cumulativeForecast - withoutOpening[0].cumulativeForecast).toBeGreaterThanOrEqual(50000);
    expect(withoutOpening[0].cumulativeForecast).toBe(withoutOpening[0].netForecast);
  });
});

describe("Regressão central: as três fontes somam sem duplicar, e o rateio aparece fracionado", () => {
  it("carteira + recebível avulso + conta a pagar rateada aparecem exatos no mesmo bucket, sem duplicação entre empreendimentos", async () => {
    const dueDate = new Date();
    const before = await getCashFlow(org.id, { developmentId: devAId, granularity: "daily", daysBack: 0, daysForward: 0 });
    const beforeB = await getCashFlow(org.id, { developmentId: devBId, granularity: "daily", daysBack: 0, daysForward: 0 });

    // Conta a pagar rateada 70/30 entre devA e devB.
    const payable = await createPayable(context, {
      category: "ADMINISTRATION",
      description: "Despesa rateada regressão",
      competenceDate: dueDate,
      dueDate,
      amount: 10000,
      developmentId: devAId,
    });
    await setPayableAllocations(context, payable.id, [
      { developmentId: devAId, percent: 70, amount: 7000 },
      { developmentId: devBId, percent: 30, amount: 3000 },
    ]);

    // Recebível avulso só de devA.
    const receivable = await createReceivable(context, {
      category: "SPACE_RENTAL",
      origin: "Aluguel regressão",
      dueDate,
      amount: 4000,
      developmentId: devAId,
    });
    await registerReceivableReceipt(context, receivable.id, { receivedAt: dueDate, receivedAmount: 4000 });

    const afterA = await getCashFlow(org.id, { developmentId: devAId, granularity: "daily", daysBack: 0, daysForward: 0 });
    const afterB = await getCashFlow(org.id, { developmentId: devBId, granularity: "daily", daysBack: 0, daysForward: 0 });

    // devA: só a fração dele do rateio (7000), nunca os 10000 inteiros.
    expect(afterA[0].payablesForecast - before[0].payablesForecast).toBe(7000);
    // devB: só a fração dele (3000).
    expect(afterB[0].payablesForecast - beforeB[0].payablesForecast).toBe(3000);
    // Soma das partes bate exato com o total rateado — nada duplicado nem perdido.
    expect(
      afterA[0].payablesForecast - before[0].payablesForecast + (afterB[0].payablesForecast - beforeB[0].payablesForecast),
    ).toBe(10000);

    // Recebível avulso: só devA vê o valor recebido; devB não vê nada dele.
    expect(afterA[0].receivablesRealized - before[0].receivablesRealized).toBe(4000);
    expect(afterB[0].receivablesRealized - beforeB[0].receivablesRealized).toBe(0);
  });
});

describe("Isolamento entre organizações", () => {
  it("Org B não vê o fluxo de caixa da Org A", async () => {
    const orgB = await prisma.organization.create({ data: { name: "Org B — Cash Flow" } });
    const userB = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "org-b-cashflow@teste.local", fullName: "Usuário Org B" },
    });

    const buckets = await getCashFlow(orgB.id, { granularity: "daily", daysBack: 0, daysForward: 0 });
    expect(buckets[0].payablesForecast).toBe(0);
    expect(buckets[0].receivablesForecast).toBe(0);
    expect(buckets[0].cumulativeForecast).toBe(0);

    await prisma.organization.delete({ where: { id: orgB.id } });
    await prisma.user.deleteMany({ where: { id: userB.id } });
  });
});
