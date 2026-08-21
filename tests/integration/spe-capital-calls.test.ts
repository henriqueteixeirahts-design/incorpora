import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createSpeInvestor } from "@/server/spe-people";
import {
  listCapitalCalls,
  listOverdueCapitalCalls,
  createCapitalCall,
  computeCapitalCallDisplayStatus,
} from "@/server/spe-capital-calls";
import { createContribution } from "@/server/spe-contributions";
import { createBankAccount, linkSpeBankAccount } from "@/server/bank-accounts";

/**
 * docs/ESPEC_APORTES_INVESTIDORES.md, Etapa 3 — chamada de capital: gera a
 * previsão (origin=CAPITAL_CALL) + o registro da chamada juntos, status
 * exibido reaproveita o da previsão ("Vencida" computado ao vivo, nunca
 * persistido).
 */

let org: { id: string };
let otherOrg: { id: string };
let user: { id: string };
let context: AccessContext;
let investor: Awaited<ReturnType<typeof createSpeInvestor>>;
let bankAccount: Awaited<ReturnType<typeof createBankAccount>>;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Chamada de Capital" } });
  otherOrg = await prisma.organization.create({ data: { name: "Org — Chamada de Capital (outra)" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "chamada-capital@teste.local", fullName: "Usuário Chamada" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Chamada de Capital", document: "63265390000141", status: "ACTIVE",
    email: "spe-chamada@teste.local", phone: "62999990097",
  });

  bankAccount = await createBankAccount(context, { bankName: "341 - Itaú", agency: "1234", account: "56789-0", type: "CHECKING", status: "ACTIVE" });
  await linkSpeBankAccount(context, spe.id, bankAccount.id, true);

  investor = await createSpeInvestor(context, spe.id, {
    type: "INDIVIDUAL", name: "Investidor Chamada", document: "02654427102",
    email: "investidor-chamada@teste.local", phone: "62999998802", modality: "EQUITY", committedCapital: 100000,
  });
});

afterAll(async () => {
  const orgIds = [org.id, otherOrg.id];
  await prisma.speCapitalCall.deleteMany({ where: { forecast: { investor: { spe: { organizationId: { in: orgIds } } } } } });
  await prisma.speInvestorContribution.deleteMany({ where: { investor: { spe: { organizationId: { in: orgIds } } } } });
  await prisma.speInvestorContributionForecast.deleteMany({ where: { investor: { spe: { organizationId: { in: orgIds } } } } });
  await prisma.speInvestor.deleteMany({ where: { spe: { organizationId: { in: orgIds } } } });
  await prisma.speBankAccount.deleteMany({ where: { spe: { organizationId: { in: orgIds } } } });
  await prisma.bankAccount.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("computeCapitalCallDisplayStatus — resolução pura", () => {
  it("PLANNED com prazo no futuro é Emitida", () => {
    expect(computeCapitalCallDisplayStatus("PLANNED", new Date(Date.now() + 86400000))).toBe("EMITTED");
  });
  it("PLANNED com prazo vencido é Vencida", () => {
    expect(computeCapitalCallDisplayStatus("PLANNED", new Date(Date.now() - 86400000))).toBe("OVERDUE");
  });
  it("PARTIALLY_FULFILLED com prazo vencido também é Vencida", () => {
    expect(computeCapitalCallDisplayStatus("PARTIALLY_FULFILLED", new Date(Date.now() - 86400000))).toBe("OVERDUE");
  });
  it("FULFILLED nunca é Vencida, mesmo com prazo no passado", () => {
    expect(computeCapitalCallDisplayStatus("FULFILLED", new Date(Date.now() - 86400000))).toBe("FULFILLED");
  });
  it("CANCELLED nunca é Vencida", () => {
    expect(computeCapitalCallDisplayStatus("CANCELLED", new Date(Date.now() - 86400000))).toBe("CANCELLED");
  });
});

describe("createCapitalCall — gera previsão + chamada juntos", () => {
  it("cria a previsão com origin=CAPITAL_CALL vinculada 1:1", async () => {
    const call = await createCapitalCall(context, investor.id, {
      amount: 50000,
      expectedDate: new Date(Date.now() + 10 * 86400000),
      deadlineDate: new Date(Date.now() + 20 * 86400000),
      purpose: "Aquisição de terreno",
    });

    const forecast = await prisma.speInvestorContributionForecast.findUnique({ where: { id: call.forecastId } });
    expect(forecast?.origin).toBe("CAPITAL_CALL");
    expect(Number(forecast?.amount)).toBe(50000);
    expect(forecast?.status).toBe("PLANNED");

    const calls = await listCapitalCalls(context, investor.id);
    const listed = calls.find((c) => c.id === call.id)!;
    expect(listed.displayStatus).toBe("EMITTED");
    expect(listed.purpose).toBe("Aquisição de terreno");
  });

  it("rejeita prazo de atendimento anterior à data prevista", async () => {
    await expect(
      createCapitalCall(context, investor.id, {
        amount: 10000,
        expectedDate: new Date(Date.now() + 20 * 86400000),
        deadlineDate: new Date(Date.now() + 10 * 86400000),
      }),
    ).rejects.toThrow("O prazo de atendimento não pode ser anterior");
  });

  it("aporte vinculado baixa a chamada — status reflete o da previsão (Atendida)", async () => {
    const call = await createCapitalCall(context, investor.id, {
      amount: 20000,
      expectedDate: new Date(Date.now() + 5 * 86400000),
      deadlineDate: new Date(Date.now() + 15 * 86400000),
    });

    await createContribution(context, investor.id, {
      forecastId: call.forecastId,
      amount: 20000,
      creditDate: new Date(),
      bankAccountId: bankAccount.id,
    });

    const calls = await listCapitalCalls(context, investor.id);
    const listed = calls.find((c) => c.id === call.id)!;
    expect(listed.displayStatus).toBe("FULFILLED");
  });
});

describe("listOverdueCapitalCalls — painel em destaque, isolado por organização", () => {
  it("lista só chamadas vencidas (prazo passado, ainda não totalmente atendidas) desta organização", async () => {
    const overdueCall = await createCapitalCall(context, investor.id, {
      amount: 15000,
      expectedDate: new Date(Date.now() - 5 * 86400000),
      deadlineDate: new Date(Date.now() - 1 * 86400000),
    });
    const futureCall = await createCapitalCall(context, investor.id, {
      amount: 15000,
      expectedDate: new Date(Date.now() + 5 * 86400000),
      deadlineDate: new Date(Date.now() + 15 * 86400000),
    });

    const overdue = await listOverdueCapitalCalls(context);
    expect(overdue.some((c) => c.id === overdueCall.id)).toBe(true);
    expect(overdue.some((c) => c.id === futureCall.id)).toBe(false);
  });

  it("não vaza chamada vencida de outra organização", async () => {
    const otherContext: AccessContext = { ...context, organizationId: otherOrg.id };
    const overdue = await listOverdueCapitalCalls(otherContext);
    expect(overdue).toHaveLength(0);
  });
});
