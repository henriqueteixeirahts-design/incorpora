import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createBankAccount, linkSpeBankAccount } from "@/server/bank-accounts";
import { createSpeInvestor } from "@/server/spe-people";
import {
  getInvestorContributionsDetail,
  getSpeContributionSummary,
  createContributionForecast,
  updateContributionForecast,
  cancelContributionForecast,
  createContribution,
  deleteContribution,
} from "@/server/spe-contributions";

/**
 * docs/ESPEC_APORTES_INVESTIDORES.md, etapas 1-2: capital comprometido +
 * condições do vínculo, e o ciclo previsto x realizado (previsão -> aporte
 * -> baixa total/parcial -> cancelamento). Cobre também isolamento entre
 * organizações, seguindo o padrão de tests/integration/org-scope*.test.ts.
 */

let orgA: { id: string };
let orgB: { id: string };
let userA: { id: string };
let userB: { id: string };
let contextA: AccessContext;
let contextB: AccessContext;

let investorA: Awaited<ReturnType<typeof createSpeInvestor>>;
let bankAccountA: Awaited<ReturnType<typeof createBankAccount>>;

beforeAll(async () => {
  orgA = await prisma.organization.create({ data: { name: "Org A — Aportes" } });
  orgB = await prisma.organization.create({ data: { name: "Org B — Aportes" } });

  userA = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "org-a-aportes@teste.local", fullName: "Usuário Org A" },
  });
  userB = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "org-b-aportes@teste.local", fullName: "Usuário Org B" },
  });

  contextA = { userId: userA.id, organizationId: orgA.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };
  contextB = { userId: userB.id, organizationId: orgB.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const speA = await createSpe(contextA, {
    name: "SPE Aportes A",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-aportes-a@teste.local",
    phone: "62999990010",
  });

  bankAccountA = await createBankAccount(contextA, {
    bankName: "341 - Itaú",
    agency: "1234",
    account: "56789-0",
    type: "CHECKING",
    status: "ACTIVE",
  });
  await linkSpeBankAccount(contextA, speA.id, bankAccountA.id, true);

  investorA = await createSpeInvestor(contextA, speA.id, {
    type: "INDIVIDUAL",
    name: "Investidor Aportes A",
    document: "02654427102",
    email: "investidor-aportes-a@teste.local",
    phone: "62999998801",
    modality: "EQUITY",
    committedCapital: 100000,
  });
});

afterAll(async () => {
  const orgIds = [orgA.id, orgB.id];
  await prisma.speInvestorContribution.deleteMany({ where: { investor: { spe: { organizationId: { in: orgIds } } } } });
  await prisma.speInvestorContributionForecast.deleteMany({
    where: { investor: { spe: { organizationId: { in: orgIds } } } },
  });
  await prisma.speInvestor.deleteMany({ where: { spe: { organizationId: { in: orgIds } } } });
  await prisma.speBankAccount.deleteMany({ where: { spe: { organizationId: { in: orgIds } } } });
  await prisma.bankAccount.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("previsão de aporte — baixa total/parcial", () => {
  it("baixa parcialmente a previsão quando o aporte é menor que o valor previsto", async () => {
    const forecast = await createContributionForecast(contextA, investorA.id, {
      amount: 10000,
      expectedDate: new Date("2026-08-01"),
      origin: "CASH_FLOW_PLANNING",
    });
    expect(forecast.status).toBe("PLANNED");

    await createContribution(contextA, investorA.id, {
      forecastId: forecast.id,
      amount: 4000,
      creditDate: new Date("2026-08-05"),
      bankAccountId: bankAccountA.id,
    });

    const afterPartial = await prisma.speInvestorContributionForecast.findUniqueOrThrow({
      where: { id: forecast.id },
    });
    expect(afterPartial.status).toBe("PARTIALLY_FULFILLED");

    await createContribution(contextA, investorA.id, {
      forecastId: forecast.id,
      amount: 6000,
      creditDate: new Date("2026-08-10"),
      bankAccountId: bankAccountA.id,
    });

    const afterFull = await prisma.speInvestorContributionForecast.findUniqueOrThrow({ where: { id: forecast.id } });
    expect(afterFull.status).toBe("FULFILLED");

    // Editar o valor previsto pra cima recalcula o status a partir do que já foi
    // aportado — evita ficar com um FULFILLED desatualizado depois da edição.
    const edited = await updateContributionForecast(contextA, investorA.id, forecast.id, {
      amount: 20000,
      expectedDate: new Date("2026-08-01"),
      origin: "CASH_FLOW_PLANNING",
    });
    expect(edited.amount.toString()).toBe("20000");
    const afterEdit = await prisma.speInvestorContributionForecast.findUniqueOrThrow({ where: { id: forecast.id } });
    expect(afterEdit.status).toBe("PARTIALLY_FULFILLED");
  });

  it("volta pra PLANNED se o aporte que baixava a previsão é removido", async () => {
    const forecast = await createContributionForecast(contextA, investorA.id, {
      amount: 5000,
      expectedDate: new Date("2026-09-01"),
      origin: "PUNCTUAL_AGREEMENT",
    });
    const contribution = await createContribution(contextA, investorA.id, {
      forecastId: forecast.id,
      amount: 5000,
      creditDate: new Date("2026-09-02"),
      bankAccountId: bankAccountA.id,
    });

    let updated = await prisma.speInvestorContributionForecast.findUniqueOrThrow({ where: { id: forecast.id } });
    expect(updated.status).toBe("FULFILLED");

    await deleteContribution(contextA, investorA.id, contribution.id);

    updated = await prisma.speInvestorContributionForecast.findUniqueOrThrow({ where: { id: forecast.id } });
    expect(updated.status).toBe("PLANNED");
  });

  it("cancela previsão não baixada com motivo auditável, mas bloqueia cancelamento de previsão já totalmente baixada", async () => {
    const forecast = await createContributionForecast(contextA, investorA.id, {
      amount: 3000,
      expectedDate: new Date("2026-10-01"),
      origin: "CAPITAL_CALL",
    });

    const cancelled = await cancelContributionForecast(contextA, investorA.id, forecast.id, "Investidor desistiu");
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelReason).toBe("Investidor desistiu");

    const fulfilled = await createContributionForecast(contextA, investorA.id, {
      amount: 1000,
      expectedDate: new Date("2026-10-05"),
      origin: "CASH_FLOW_PLANNING",
    });
    await createContribution(contextA, investorA.id, {
      forecastId: fulfilled.id,
      amount: 1000,
      creditDate: new Date("2026-10-06"),
      bankAccountId: bankAccountA.id,
    });

    await expect(cancelContributionForecast(contextA, investorA.id, fulfilled.id, "tarde demais")).rejects.toThrow();
  });

  it("não permite vincular um aporte a uma previsão já cancelada", async () => {
    const forecast = await createContributionForecast(contextA, investorA.id, {
      amount: 2000,
      expectedDate: new Date("2026-11-01"),
      origin: "PUNCTUAL_AGREEMENT",
    });
    await cancelContributionForecast(contextA, investorA.id, forecast.id, "cancelado antes do aporte");

    await expect(
      createContribution(contextA, investorA.id, {
        forecastId: forecast.id,
        amount: 2000,
        creditDate: new Date("2026-11-02"),
        bankAccountId: bankAccountA.id,
      }),
    ).rejects.toThrow();
  });
});

describe("resumo previsto x realizado", () => {
  it("getInvestorContributionsDetail e getSpeContributionSummary somam só o não cancelado", async () => {
    const detail = await getInvestorContributionsDetail(contextA, investorA.id);
    expect(detail.summary.committed).toBe(100000);
    expect(detail.summary.totalRealized).toBeGreaterThan(0);
    expect(detail.summary.integralizedPct).toBeCloseTo((detail.summary.totalRealized / 100000) * 100, 5);

    const spe = await prisma.speInvestor.findUniqueOrThrow({ where: { id: investorA.id }, select: { speId: true } });
    const summary = await getSpeContributionSummary(contextA, spe.speId);
    expect(summary.committed).toBe(100000);
    expect(summary.totalRealized).toBe(detail.summary.totalRealized);
  });
});

describe("isolamento entre organizações", () => {
  it("Org B não acessa nem manipula previsão/aporte do investidor da Org A", async () => {
    await expect(
      createContributionForecast(contextB, investorA.id, {
        amount: 1000,
        expectedDate: new Date("2026-08-01"),
        origin: "CASH_FLOW_PLANNING",
      }),
    ).rejects.toThrow();

    await expect(getInvestorContributionsDetail(contextB, investorA.id)).rejects.toThrow();

    await expect(
      createContribution(contextB, investorA.id, {
        amount: 1000,
        creditDate: new Date("2026-08-01"),
        bankAccountId: bankAccountA.id,
      }),
    ).rejects.toThrow();

    const spe = await prisma.speInvestor.findUniqueOrThrow({ where: { id: investorA.id }, select: { speId: true } });
    await expect(getSpeContributionSummary(contextB, spe.speId)).rejects.toThrow();
  });
});
