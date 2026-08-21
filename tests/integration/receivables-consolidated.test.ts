import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createSpeInvestor } from "@/server/spe-people";
import { createContributionForecast, createContribution } from "@/server/spe-contributions";
import { createReceivable, registerReceivableReceipt } from "@/server/receivables-avulsos";
import { listConsolidatedReceivables, summarizeConsolidatedReceivables } from "@/server/receivables-consolidated";
import { getSalesSummary, getReceivablesSummary } from "@/server/reports";

/**
 * docs/ESPEC_APORTES_INVESTIDORES.md, Etapa 7 — contas a receber consolidado.
 * A origem "carteira de vendas" reaproveita getInstallmentLivePosition (já
 * coberto por tests/integration/aging-collection.test.ts), então este
 * arquivo foca em avulso + aporte, filtros e a regra de ouro (aporte nunca
 * soma como receita nos relatórios de resultado).
 */

let org: { id: string };
let otherOrg: { id: string };
let user: { id: string };
let context: AccessContext;
let investorId: string;
let bankAccountId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — AR Consolidado" } });
  otherOrg = await prisma.organization.create({ data: { name: "Org — AR Consolidado (outra)" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "ar-consolidado@teste.local", fullName: "Usuário AR Consolidado" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE AR Consolidado", document: "63265390000906", status: "ACTIVE",
    email: "spe-ar-consolidado@teste.local", phone: "62999990702",
  });

  const investor = await createSpeInvestor(context, spe.id, {
    type: "INDIVIDUAL", name: "Investidor AR Consolidado", document: "02654427102",
    email: "investidor-ar-consolidado@teste.local", phone: "62999998808", modality: "EQUITY",
  });
  investorId = investor.id;

  const bankAccount = await prisma.bankAccount.create({
    data: { organizationId: org.id, bankName: "Itaú", agency: "0004", account: "3333-4", type: "CHECKING", status: "ACTIVE" },
  });
  bankAccountId = bankAccount.id;

  // Avulso previsto (pendente) + realizado (recebido).
  await createReceivable(context, {
    speId: spe.id, category: "OTHER", origin: "Reembolso teste", dueDate: new Date(2099, 0, 1), amount: 500,
  });
  const receivedOne = await createReceivable(context, {
    speId: spe.id, category: "OTHER", origin: "Aluguel de espaço teste", dueDate: new Date(2024, 0, 1), amount: 1200,
  });
  await registerReceivableReceipt(context, receivedOne.id, { receivedAt: new Date(2024, 0, 5), receivedAmount: 1200 });

  // Aporte previsto + realizado.
  await createContributionForecast(context, investorId, { amount: 30000, expectedDate: new Date(2099, 0, 1), origin: "PUNCTUAL_AGREEMENT" });
  await createContribution(context, investorId, { amount: 12000, creditDate: new Date(2024, 0, 10), bankAccountId });
});

afterAll(async () => {
  const orgIds = [org.id, otherOrg.id];
  await prisma.speInvestorContribution.deleteMany({ where: { investor: { spe: { organizationId: { in: orgIds } } } } });
  await prisma.speInvestorContributionForecast.deleteMany({ where: { investor: { spe: { organizationId: { in: orgIds } } } } });
  await prisma.speInvestor.deleteMany({ where: { spe: { organizationId: { in: orgIds } } } });
  await prisma.receivable.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.bankAccount.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("listConsolidatedReceivables", () => {
  it("mescla avulso e aporte com status derivado (previsto/vencido/realizado)", async () => {
    const rows = await listConsolidatedReceivables(context);
    const avulsoRows = rows.filter((r) => r.origin === "AVULSO");
    const investorRows = rows.filter((r) => r.origin === "INVESTOR_CONTRIBUTION");

    expect(avulsoRows).toHaveLength(2);
    expect(avulsoRows.find((r) => r.amount === 1200)?.status).toBe("REALIZED");
    expect(avulsoRows.find((r) => r.amount === 500)?.status).toBe("FORECAST");

    expect(investorRows).toHaveLength(2);
    expect(investorRows.find((r) => r.amount === 12000)?.status).toBe("REALIZED");
    expect(investorRows.find((r) => r.amount === 30000)?.status).toBe("FORECAST");
  });

  it("filtro por origem retorna só aquela origem", async () => {
    const rows = await listConsolidatedReceivables(context, { origin: "INVESTOR_CONTRIBUTION" });
    expect(rows.every((r) => r.origin === "INVESTOR_CONTRIBUTION")).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("filtro por status realizado exclui os previstos", async () => {
    const rows = await listConsolidatedReceivables(context, { status: "REALIZED" });
    expect(rows.every((r) => r.status === "REALIZED")).toBe(true);
  });

  it("filtro por empreendimento específico não atribui aporte de SPE (fora do escopo)", async () => {
    const rows = await listConsolidatedReceivables(context, { developmentId: "00000000-0000-0000-0000-000000000000" });
    expect(rows.some((r) => r.origin === "INVESTOR_CONTRIBUTION")).toBe(false);
  });

  it("totalizadores por origem batem com a soma das linhas", async () => {
    const rows = await listConsolidatedReceivables(context);
    const totals = summarizeConsolidatedReceivables(rows);
    expect(totals.byOrigin.AVULSO).toBe(1700);
    expect(totals.byOrigin.INVESTOR_CONTRIBUTION).toBe(42000);
    expect(totals.overall).toBe(totals.byOrigin.SALES + totals.byOrigin.AVULSO + totals.byOrigin.INVESTOR_CONTRIBUTION);
  });

  it("isolamento por organização: aporte de outra org nunca aparece", async () => {
    const otherContext: AccessContext = { ...context, organizationId: otherOrg.id };
    const rows = await listConsolidatedReceivables(otherContext, { origin: "INVESTOR_CONTRIBUTION" });
    expect(rows).toHaveLength(0);
  });
});

describe("regra de ouro — relatórios de resultado não somam aporte como receita", () => {
  it("getSalesSummary e getReceivablesSummary ignoram SpeInvestorContribution por completo", async () => {
    const [sales, receivables] = await Promise.all([
      getSalesSummary(org.id),
      getReceivablesSummary(org.id),
    ]);
    // nenhuma venda/parcela criada neste teste — os totais devem ficar
    // zerados mesmo com 12.000 de aporte realizado e 30.000 previsto no ar.
    expect(sales.vgvSold).toBe(0);
    expect(receivables.totalReceived).toBe(0);
  });
});
