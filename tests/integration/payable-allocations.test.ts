import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createDevelopment, deleteDevelopment } from "@/server/developments";
import { createSpe } from "@/server/spes";
import { createPayable, getPayableDetail, type CreatePayableInput } from "@/server/payables";
import {
  setPayableAllocations,
  createAllocationTemplate,
  listAllocationTemplates,
} from "@/server/payable-allocations";
import { getPayablesSummary } from "@/server/reports";
import { getCashFlow } from "@/server/cash-flow";

/**
 * Fase B, etapa 5 (docs/ESPEC_FASE_B_CARTEIRA_FINANCEIRO_1.md, Parte 4.2) —
 * rateio de despesa entre empreendimentos. Rigor central: os relatórios
 * (getPayablesSummary) e o fluxo de caixa (getCashFlow) precisam somar só a
 * fração rateada por empreendimento — nunca o valor cheio duplicado em dois
 * empreendimentos.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let devAId: string;
let devBId: string;
let speId: string;

function baseInput(overrides: Partial<CreatePayableInput> = {}): CreatePayableInput {
  return {
    category: "ADMINISTRATION",
    description: "Despesa rateada",
    competenceDate: new Date("2026-08-01"),
    dueDate: new Date("2026-08-15"),
    amount: 10000,
    ...overrides,
  };
}

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Allocations" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "allocations@teste.local", fullName: "Usuário Rateio" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Allocations",
    document: "63265390000338",
    status: "ACTIVE",
    email: "spe-allocations@teste.local",
    phone: "62999990300",
  });
  speId = spe.id;

  const devA = await createDevelopment(context, { speId, name: "Empreendimento A", type: "RESIDENTIAL_BUILDING" });
  const devB = await createDevelopment(context, { speId, name: "Empreendimento B", type: "RESIDENTIAL_BUILDING" });
  devAId = devA.id;
  devBId = devB.id;
});

afterAll(async () => {
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
});

describe("setPayableAllocations — validação centavo a centavo", () => {
  it("aceita um rateio cuja soma bate exata com o valor total", async () => {
    const payable = await createPayable(context, baseInput({ amount: 1000 }));
    await setPayableAllocations(context, payable.id, [
      { developmentId: devAId, percent: 60, amount: 600 },
      { developmentId: devBId, percent: 40, amount: 400 },
    ]);
    const detail = await getPayableDetail(context, payable.id);
    expect(detail!.allocations).toHaveLength(2);
    expect(detail!.allocations.reduce((acc, a) => acc + Number(a.amount), 0)).toBe(1000);
  });

  it("rejeita quando a soma do rateio não bate com o valor total", async () => {
    const payable = await createPayable(context, baseInput({ amount: 1000 }));
    await expect(
      setPayableAllocations(context, payable.id, [
        { developmentId: devAId, percent: 60, amount: 600 },
        { developmentId: devBId, percent: 40, amount: 300 },
      ]),
    ).rejects.toThrow(/soma do rateio/i);
  });

  it("rejeita destino com empreendimento de outra organização", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: "Outra Org" } });
    const otherSpe = await createSpe(
      { ...context, organizationId: otherOrg.id },
      { name: "SPE Outra", document: "63265390000419", status: "ACTIVE", email: "outra@teste.local", phone: "62999990400" },
    );
    const otherDev = await createDevelopment(
      { ...context, organizationId: otherOrg.id },
      { speId: otherSpe.id, name: "Dev de outra org", type: "RESIDENTIAL_BUILDING" },
    );

    const payable = await createPayable(context, baseInput({ amount: 1000 }));
    await expect(
      setPayableAllocations(context, payable.id, [{ developmentId: otherDev.id, percent: 100, amount: 1000 }]),
    ).rejects.toThrow(/empreendimento inválido/i);

    await prisma.organization.delete({ where: { id: otherOrg.id } });
  });

  it("array vazio remove o rateio (volta a ser destino único)", async () => {
    const payable = await createPayable(context, baseInput({ amount: 1000, developmentId: devAId }));
    await setPayableAllocations(context, payable.id, [
      { developmentId: devAId, percent: 50, amount: 500 },
      { developmentId: devBId, percent: 50, amount: 500 },
    ]);
    await setPayableAllocations(context, payable.id, []);
    const detail = await getPayableDetail(context, payable.id);
    expect(detail!.allocations).toHaveLength(0);
  });
});

describe("Modelos de rateio salvos", () => {
  it("valida que os percentuais somam 100%", async () => {
    await expect(
      createAllocationTemplate(context, {
        name: "Modelo inválido",
        destinations: [
          { developmentId: devAId, percent: 60 },
          { developmentId: devBId, percent: 30 },
        ],
      }),
    ).rejects.toThrow(/somar 100%/i);
  });

  it("cria e lista um modelo válido", async () => {
    await createAllocationTemplate(context, {
      name: "Administrativo 60/40",
      destinations: [
        { developmentId: devAId, percent: 60 },
        { developmentId: devBId, percent: 40 },
      ],
    });
    const templates = await listAllocationTemplates(context);
    const template = templates.find((t) => t.name === "Administrativo 60/40");
    expect(template).toBeDefined();
    expect(template!.destinations).toHaveLength(2);
  });
});

describe("Regressão crítica: relatórios e fluxo de caixa nunca duplicam o valor rateado", () => {
  it("getPayablesSummary soma só a fração de cada empreendimento, e o total bate com a soma das partes", async () => {
    const before = await Promise.all([
      getPayablesSummary(org.id, devAId),
      getPayablesSummary(org.id, devBId),
      getPayablesSummary(org.id),
    ]);

    const payable = await createPayable(context, baseInput({ amount: 10000, description: "Rateio 60/40" }));
    await setPayableAllocations(context, payable.id, [
      { developmentId: devAId, percent: 60, amount: 6000 },
      { developmentId: devBId, percent: 40, amount: 4000 },
    ]);

    const [summaryA, summaryB, summaryOrg] = await Promise.all([
      getPayablesSummary(org.id, devAId),
      getPayablesSummary(org.id, devBId),
      getPayablesSummary(org.id),
    ]);

    // Cada empreendimento vê só a fração dele — não o valor cheio.
    expect(summaryA.totalPending - before[0].totalPending).toBe(6000);
    expect(summaryB.totalPending - before[1].totalPending).toBe(4000);
    // A soma das partes bate exato com o total — nenhum centavo perdido nem duplicado.
    expect(summaryOrg.totalPending - before[2].totalPending).toBe(10000);
  });

  it("getCashFlow soma só a fração de cada empreendimento no mês de vencimento", async () => {
    const dueDate = new Date();
    const before = await Promise.all([
      getCashFlow(context, { developmentId: devAId, monthsBack: 0, monthsForward: 0 }),
      getCashFlow(context, { developmentId: devBId, monthsBack: 0, monthsForward: 0 }),
      getCashFlow(context, { monthsBack: 0, monthsForward: 0 }),
    ]);

    const payable = await createPayable(context, baseInput({ amount: 5000, dueDate, description: "Rateio fluxo de caixa" }));
    await setPayableAllocations(context, payable.id, [
      { developmentId: devAId, percent: 70, amount: 3500 },
      { developmentId: devBId, percent: 30, amount: 1500 },
    ]);

    const [flowA, flowB, flowOrg] = await Promise.all([
      getCashFlow(context, { developmentId: devAId, monthsBack: 0, monthsForward: 0 }),
      getCashFlow(context, { developmentId: devBId, monthsBack: 0, monthsForward: 0 }),
      getCashFlow(context, { monthsBack: 0, monthsForward: 0 }),
    ]);

    expect(flowA[0].payablesForecast - before[0][0].payablesForecast).toBe(3500);
    expect(flowB[0].payablesForecast - before[1][0].payablesForecast).toBe(1500);
    expect(flowOrg[0].payablesForecast - before[2][0].payablesForecast).toBe(5000);
  });

  it("conta sem rateio configurado continua contando 100% no seu único empreendimento (compatibilidade retroativa)", async () => {
    const before = await Promise.all([getPayablesSummary(org.id, devAId), getPayablesSummary(org.id, devBId)]);

    const payable = await createPayable(context, baseInput({ amount: 2000, developmentId: devAId, description: "Sem rateio" }));
    const matching = await getPayableDetail(context, payable.id);
    expect(matching!.allocations).toHaveLength(0);

    const [summaryA, summaryB] = await Promise.all([getPayablesSummary(org.id, devAId), getPayablesSummary(org.id, devBId)]);
    // devA deve incluir o valor cheio dessa conta; devB não deve ver nada dela.
    expect(summaryA.totalPending - before[0].totalPending).toBe(2000);
    expect(summaryB.totalPending - before[1].totalPending).toBe(0);
  });
});

describe("Exclusão de empreendimento bloqueada por rateio vinculado", () => {
  it("não permite excluir um empreendimento que é destino de rateio", async () => {
    const spe = await createSpe(context, {
      name: "SPE Delete Guard",
      document: "63265390000501",
      status: "ACTIVE",
      email: "delete-guard@teste.local",
      phone: "62999990500",
    });
    const devC = await createDevelopment(context, { speId: spe.id, name: "Empreendimento C", type: "RESIDENTIAL_BUILDING" });

    const payable = await createPayable(context, baseInput({ amount: 1000, developmentId: devAId, description: "Rateio com devC" }));
    await setPayableAllocations(context, payable.id, [
      { developmentId: devAId, percent: 50, amount: 500 },
      { developmentId: devC.id, percent: 50, amount: 500 },
    ]);

    await expect(deleteDevelopment(context, devC.id)).rejects.toThrow(/não é possível excluir/i);

    await setPayableAllocations(context, payable.id, []);
    await prisma.development.delete({ where: { id: devC.id } });
  });
});
