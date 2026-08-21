import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createSpeInvestor } from "@/server/spe-people";
import { createInvestorReturn } from "@/server/spe-investor-returns";
import { getInvestorLoanPosition } from "@/server/spe-investor-loan";

/**
 * docs/ESPEC_APORTES_INVESTIDORES.md, Etapa 5 — motor de mútuo. Cenário
 * conferido manualmente (ver comentários), rigor Sprint 6-7: 2 tranches de
 * aporte, juros compostos de 1% a.m., uma amortização parcial que consome a
 * tranche mais antiga inteira (juros + parte do principal) e cascateia.
 */

let org: { id: string };
let otherOrg: { id: string };
let user: { id: string };
let context: AccessContext;
let investor: Awaited<ReturnType<typeof createSpeInvestor>>;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Motor de Mútuo" } });
  otherOrg = await prisma.organization.create({ data: { name: "Org — Motor de Mútuo (outra)" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "motor-mutuo@teste.local", fullName: "Usuário Motor Mútuo" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };

  const spe = await createSpe(context, {
    name: "SPE Motor Mútuo", document: "63265390000141", status: "ACTIVE",
    email: "spe-mutuo@teste.local", phone: "62999990099",
  });

  investor = await createSpeInvestor(context, spe.id, {
    type: "INDIVIDUAL", name: "Investidor Mútuo", document: "02654427102",
    email: "investidor-mutuo@teste.local", phone: "62999998804", modality: "LOAN",
    loanInterestRate: 1, loanInterestPeriod: "MONTHLY", loanInterestType: "COMPOUND",
    loanGraceMonths: 6, loanTermMonths: 24,
  });

  await prisma.speInvestor.update({
    where: { id: investor.id },
    data: { returnBankName: "341 - Itaú", returnBankAgency: "1234", returnBankAccount: "56789-0" },
  });

  const bankAccount = await prisma.bankAccount.create({
    data: { organizationId: org.id, bankName: "Itaú", agency: "0001", account: "12345-6", type: "CHECKING", status: "ACTIVE" },
  });

  // Duas tranches, mesma data-base (2024-01-01): 10.000 + 5.000.
  await prisma.speInvestorContribution.create({
    data: { investorId: investor.id, amount: 10000, creditDate: new Date(2024, 0, 1), bankAccountId: bankAccount.id },
  });
  await prisma.speInvestorContribution.create({
    data: { investorId: investor.id, amount: 5000, creditDate: new Date(2024, 0, 1), bankAccountId: bankAccount.id },
  });
});

afterAll(async () => {
  const orgIds = [org.id, otherOrg.id];
  await prisma.speInvestorLoanCalculation.deleteMany({ where: { investor: { spe: { organizationId: { in: orgIds } } } } });
  await prisma.speInvestorReturn.deleteMany({ where: { investor: { spe: { organizationId: { in: orgIds } } } } });
  await prisma.payable.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.supplier.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.speInvestorContribution.deleteMany({ where: { investor: { spe: { organizationId: { in: orgIds } } } } });
  await prisma.speInvestor.deleteMany({ where: { spe: { organizationId: { in: orgIds } } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.bankAccount.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("motor de mútuo — saldo devedor e amortização", () => {
  it("posição antes de qualquer amortização: 2 meses de juros compostos de 1% a.m. sobre cada tranche", async () => {
    // fev+mar/2024 = 2 meses. fator = 1.01^2 = 1.0201.
    // tranche A: 10000 * 1.0201 = 10201.00 (juros = 201.00)
    // tranche B: 5000 * 1.0201 = 5100.50 (juros = 100.50)
    const position = await getInvestorLoanPosition(context, investor.id, new Date(2024, 2, 1));
    expect(position.totalPrincipal).toBe(15000);
    expect(position.totalAccruedInterest).toBe(301.5);
    expect(position.netBalance).toBe(15301.5);
  });

  it("amortização de 3105 na tranche mais antiga: abate os 201,00 de juros e cascateia 2.904,00 de principal", async () => {
    const before = await getInvestorLoanPosition(context, investor.id, new Date(2024, 2, 1));
    expect(before.netBalance).toBe(15301.5);

    const investorReturn = await createInvestorReturn(context, investor.id, {
      type: "LOAN_AMORTIZATION",
      amount: 3105,
      referenceDate: new Date(2024, 2, 1),
      dueDate: new Date(2024, 2, 11),
    });

    expect(Number(investorReturn.amortizedInterest)).toBe(201);
    expect(Number(investorReturn.amortizedPrincipal)).toBe(2904);

    const snapshot = await prisma.speInvestorLoanCalculation.findFirst({
      where: { investorId: investor.id },
      orderBy: { createdAt: "desc" },
    });
    expect(snapshot).not.toBeNull();
    expect(Number(snapshot!.netBalance)).toBe(12196.5); // 15301.50 - 3105.00

    const after = await getInvestorLoanPosition(context, investor.id, new Date(2024, 2, 1));
    expect(after.netBalance).toBe(12196.5);
    const trancheA = after.tranches.find((t) => t.principal === 10000)!;
    expect(trancheA.outstandingPrincipal).toBe(7096);
    expect(trancheA.accruedInterest).toBe(0);
  });

  it("mais um mês depois: continua acumulando juros compostos sobre o saldo remanescente de cada tranche", async () => {
    const position = await getInvestorLoanPosition(context, investor.id, new Date(2024, 3, 1));
    // tranche A: 7096 * 1.01 ≈ 7166.96 / tranche B: 5100.50 * 1.01 ≈ 5151.51
    expect(position.netBalance).toBeCloseTo(7166.96 + 5151.51, 1);
  });

  it("amortização acima do saldo devedor disponível é rejeitada", async () => {
    await expect(
      createInvestorReturn(context, investor.id, {
        type: "LOAN_AMORTIZATION",
        amount: 999999,
        referenceDate: new Date(2024, 3, 1),
        dueDate: new Date(2024, 3, 11),
      }),
    ).rejects.toThrow(/excede o saldo devedor/);
  });

  it("isolamento por organização", async () => {
    const otherContext: AccessContext = { ...context, organizationId: otherOrg.id };
    await expect(getInvestorLoanPosition(otherContext, investor.id)).rejects.toThrow("Investidor não encontrado.");
  });
});
