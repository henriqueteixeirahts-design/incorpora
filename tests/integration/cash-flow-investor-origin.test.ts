import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createSpeInvestor } from "@/server/spe-people";
import { createContributionForecast, createContribution } from "@/server/spe-contributions";
import { getCashFlow } from "@/server/cash-flow";

/**
 * docs/ESPEC_APORTES_INVESTIDORES.md, Etapa 7 — fluxo de caixa discriminado
 * por origem: aporte de investidor aparece como entrada de caixa (regra de
 * ouro: "o fluxo de caixa sim"), separado de venda/avulso, sem duplicar o
 * total consolidado (a soma dos 3 componentes bate com o total do bucket).
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let investorId: string;
let bankAccountId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Fluxo por Origem" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "fluxo-origem@teste.local", fullName: "Usuário Fluxo Origem" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Fluxo Origem", document: "63265390000825", status: "ACTIVE",
    email: "spe-fluxo-origem@teste.local", phone: "62999990701",
  });

  const investor = await createSpeInvestor(context, spe.id, {
    type: "INDIVIDUAL", name: "Investidor Fluxo Origem", document: "02654427102",
    email: "investidor-fluxo-origem@teste.local", phone: "62999998807", modality: "EQUITY",
  });
  investorId = investor.id;

  const bankAccount = await prisma.bankAccount.create({
    data: { organizationId: org.id, bankName: "Itaú", agency: "0003", account: "2222-3", type: "CHECKING", status: "ACTIVE" },
  });
  bankAccountId = bankAccount.id;

  await createContributionForecast(context, investorId, {
    amount: 15000,
    expectedDate: new Date(),
    origin: "PUNCTUAL_AGREEMENT",
  });

  await createContribution(context, investorId, {
    amount: 8000,
    creditDate: new Date(),
    bankAccountId,
  });
});

afterAll(async () => {
  await prisma.speInvestorContribution.deleteMany({ where: { investor: { spe: { organizationId: org.id } } } });
  await prisma.speInvestorContributionForecast.deleteMany({ where: { investor: { spe: { organizationId: org.id } } } });
  await prisma.speInvestor.deleteMany({ where: { spe: { organizationId: org.id } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: org.id } });
  await prisma.bankAccount.deleteMany({ where: { organizationId: org.id } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: org.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: org.id } });
});

describe("getCashFlow — discriminação por origem (aporte de investidor)", () => {
  it("previsão e realizado de aporte aparecem na origem investorContribution, somando pro total do bucket", async () => {
    const buckets = await getCashFlow(context, { granularity: "monthly", includeOpeningBalance: false });
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.find((b) => b.period === key)!;

    expect(bucket.receivablesForecastByOrigin.investorContribution).toBe(15000);
    expect(bucket.receivablesRealizedByOrigin.investorContribution).toBe(8000);

    const forecastSum =
      bucket.receivablesForecastByOrigin.sales +
      bucket.receivablesForecastByOrigin.avulso +
      bucket.receivablesForecastByOrigin.investorContribution;
    expect(forecastSum).toBe(bucket.receivablesForecast);

    const realizedSum =
      bucket.receivablesRealizedByOrigin.sales +
      bucket.receivablesRealizedByOrigin.avulso +
      bucket.receivablesRealizedByOrigin.investorContribution;
    expect(realizedSum).toBe(bucket.receivablesRealized);
  });

  it("filtro por empreendimento específico não atribui aporte de SPE (fica de fora)", async () => {
    const buckets = await getCashFlow(context, {
      granularity: "monthly",
      includeOpeningBalance: false,
      developmentId: "00000000-0000-0000-0000-000000000000",
    });
    const total = buckets.reduce((sum, b) => sum + b.receivablesForecastByOrigin.investorContribution, 0);
    expect(total).toBe(0);
  });
});
