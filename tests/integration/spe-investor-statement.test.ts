import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createSpeInvestor } from "@/server/spe-people";
import { createCapitalCall } from "@/server/spe-capital-calls";
import { createInvestorReturn } from "@/server/spe-investor-returns";
import { getInvestorStatement } from "@/server/spe-investor-statement";

/**
 * docs/ESPEC_APORTES_INVESTIDORES.md, Etapa 6 — extrato consolidado: resumo
 * + linha do tempo cronológica de previsão, chamada, aporte e devolução.
 */

let org: { id: string };
let otherOrg: { id: string };
let user: { id: string };
let context: AccessContext;
let equityInvestor: Awaited<ReturnType<typeof createSpeInvestor>>;
let loanInvestor: Awaited<ReturnType<typeof createSpeInvestor>>;
let bankAccountId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Extrato Investidor" } });
  otherOrg = await prisma.organization.create({ data: { name: "Org — Extrato Investidor (outra)" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "extrato-investidor@teste.local", fullName: "Usuário Extrato" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Extrato Investidor", document: "63265390000141", status: "ACTIVE",
    email: "spe-extrato@teste.local", phone: "62999990097",
  });

  equityInvestor = await createSpeInvestor(context, spe.id, {
    type: "INDIVIDUAL", name: "Investidor Equity Extrato", document: "02654427102",
    email: "equity-extrato@teste.local", phone: "62999998805", modality: "EQUITY",
    committedCapital: 50000,
  });

  loanInvestor = await createSpeInvestor(context, spe.id, {
    type: "INDIVIDUAL", name: "Investidor Mútuo Extrato", document: "11144477735",
    email: "mutuo-extrato@teste.local", phone: "62999998806", modality: "LOAN",
    loanInterestRate: 1, loanInterestPeriod: "MONTHLY", loanInterestType: "COMPOUND",
  });

  const bankAccount = await prisma.bankAccount.create({
    data: { organizationId: org.id, bankName: "Itaú", agency: "0002", account: "1111-2", type: "CHECKING", status: "ACTIVE" },
  });
  bankAccountId = bankAccount.id;

  await createCapitalCall(context, equityInvestor.id, {
    amount: 20000,
    expectedDate: new Date(2024, 0, 10),
    deadlineDate: new Date(2024, 0, 20),
    purpose: "Aquisição de terreno",
  });

  await prisma.speInvestorContribution.create({
    data: { investorId: equityInvestor.id, amount: 20000, creditDate: new Date(2024, 0, 15), bankAccountId },
  });

  await createInvestorReturn(context, equityInvestor.id, {
    type: "RESULT_DISTRIBUTION",
    amount: 3000,
    referenceDate: new Date(2024, 1, 1),
    dueDate: new Date(2024, 1, 11),
  });

  await prisma.speInvestorContribution.create({
    data: { investorId: loanInvestor.id, amount: 10000, creditDate: new Date(2024, 0, 1), bankAccountId },
  });
});

afterAll(async () => {
  const orgIds = [org.id, otherOrg.id];
  await prisma.speInvestorLoanCalculation.deleteMany({ where: { investor: { spe: { organizationId: { in: orgIds } } } } });
  await prisma.speInvestorReturn.deleteMany({ where: { investor: { spe: { organizationId: { in: orgIds } } } } });
  await prisma.payable.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.supplier.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.speInvestorContribution.deleteMany({ where: { investor: { spe: { organizationId: { in: orgIds } } } } });
  await prisma.speCapitalCall.deleteMany({ where: { forecast: { investor: { spe: { organizationId: { in: orgIds } } } } } });
  await prisma.speInvestorContributionForecast.deleteMany({ where: { investor: { spe: { organizationId: { in: orgIds } } } } });
  await prisma.speInvestor.deleteMany({ where: { spe: { organizationId: { in: orgIds } } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.bankAccount.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("getInvestorStatement", () => {
  it("resumo: soma aportes e devoluções, posição líquida = aportado - devolvido", async () => {
    const statement = await getInvestorStatement(context, equityInvestor.id);
    expect(statement.summary.totalContributed).toBe(20000);
    expect(statement.summary.totalReturned).toBe(3000);
    expect(statement.summary.netPosition).toBe(17000);
    expect(statement.summary.loanPosition).toBeNull();
  });

  it("linha do tempo: previsão (chamada), chamada de capital, aporte e devolução em ordem cronológica", async () => {
    const statement = await getInvestorStatement(context, equityInvestor.id);
    const kinds = statement.events.map((e) => e.kind);
    // ordenado por data do evento: previsão (10/jan), aporte (15/jan), prazo
    // da chamada (20/jan), devolução (1/fev) — não pela ordem de criação.
    expect(kinds).toEqual(["FORECAST", "CONTRIBUTION", "CAPITAL_CALL", "RETURN"]);
    // aporte não foi vinculado à previsão (forecastId), então a previsão/chamada
    // continuam PLANNED — como o prazo (2024-01-20) já passou, a chamada aparece vencida.
    expect(statement.events[2].statusLabel).toBe("Vencida");
  });

  it("investidor de mútuo com condições configuradas: inclui saldo devedor no resumo", async () => {
    const statement = await getInvestorStatement(context, loanInvestor.id);
    expect(statement.summary.loanPosition).not.toBeNull();
    expect(statement.summary.loanPosition!.totalPrincipal).toBe(10000);
  });

  it("isolamento por organização", async () => {
    const otherContext: AccessContext = { ...context, organizationId: otherOrg.id };
    await expect(getInvestorStatement(otherContext, equityInvestor.id)).rejects.toThrow("Investidor não encontrado.");
  });
});
