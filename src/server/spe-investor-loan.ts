import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { speOwnedScope } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";
import {
  annualToMonthlyRate,
  calculateInvestorLoanPosition,
  type CalculateInvestorLoanPositionResult,
  type LoanInterestType,
} from "@/lib/loan-balance";

const LOAN_CALCULATION_ENTITY_TYPE = "SpeInvestorLoanCalculation";

async function getLoanInvestorScoped(context: AccessContext, investorId: string) {
  const investor = await prisma.speInvestor.findFirst({ where: { id: investorId, ...speOwnedScope(context) } });
  if (!investor) throw new Error("Investidor não encontrado.");
  if (investor.modality !== "LOAN") {
    throw new Error("Este investidor não está configurado como mútuo (modality = LOAN).");
  }
  if (!investor.loanInterestRate || !investor.loanInterestPeriod || !investor.loanInterestType) {
    throw new Error(
      "Condições de mútuo incompletas — informe taxa de juros, periodicidade e tipo de juros (simples/composto) no cadastro do investidor antes de calcular o saldo devedor.",
    );
  }
  return investor;
}

/**
 * Calcula a posição atual do mútuo (saldo devedor por tranche + consolidado)
 * sem persistir nada — uso: exibir na tela, validar uma amortização antes de
 * criá-la. docs/ESPEC_APORTES_INVESTIDORES.md, Parte 1.2 e Parte 3.
 */
export async function getInvestorLoanPosition(
  context: AccessContext,
  investorId: string,
  asOfDate: Date = new Date(),
  extraAmortizations: { date: Date; amount: number }[] = [],
): Promise<CalculateInvestorLoanPositionResult> {
  const investor = await getLoanInvestorScoped(context, investorId);

  const [contributions, amortizations, indexValues] = await Promise.all([
    prisma.speInvestorContribution.findMany({
      where: { investorId },
      select: { id: true, amount: true, creditDate: true },
    }),
    prisma.speInvestorReturn.findMany({
      where: { investorId, type: "LOAN_AMORTIZATION", referenceDate: { lte: asOfDate } },
      select: { id: true, amount: true, referenceDate: true },
    }),
    investor.loanIndexRuleId
      ? prisma.indexValue.findMany({
          where: { indexRuleId: investor.loanIndexRuleId },
          select: { referenceMonth: true, ratePercent: true },
        })
      : Promise.resolve([]),
  ]);

  const interestType = investor.loanInterestType as LoanInterestType;
  const monthlyInterestPercent =
    investor.loanInterestPeriod === "YEARLY"
      ? annualToMonthlyRate(Number(investor.loanInterestRate), interestType)
      : Number(investor.loanInterestRate);

  const allAmortizations = [
    ...amortizations.map((a) => ({ id: a.id, date: a.referenceDate, amount: Number(a.amount) })),
    ...extraAmortizations.map((a, i) => ({ id: `pending-${i}`, date: a.date, amount: a.amount })),
  ];

  return calculateInvestorLoanPosition({
    tranches: contributions.map((c) => ({ id: c.id, principal: Number(c.amount), creditDate: c.creditDate })),
    amortizations: allAmortizations,
    asOfDate,
    monthlyInterestPercent,
    interestType,
    indexValues: indexValues.map((v) => ({ referenceMonth: v.referenceMonth, ratePercent: Number(v.ratePercent) })),
  });
}

/**
 * Roda o cálculo e persiste um snapshot auditável (SpeInvestorLoanCalculation)
 * — nunca sobrescreve um snapshot anterior, mesmo princípio de
 * FinancialCalculation. Chamado manualmente (botão "Recalcular") ou
 * automaticamente ao registrar uma amortização.
 */
export async function recordInvestorLoanSnapshot(context: AccessContext, investorId: string, asOfDate: Date = new Date()) {
  const position = await getInvestorLoanPosition(context, investorId, asOfDate);

  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.speInvestorLoanCalculation.create({
      data: {
        investorId,
        asOfDate,
        totalPrincipal: position.totalPrincipal,
        totalAccruedInterest: position.totalAccruedInterest,
        totalAmortized: position.totalAmortizedInterest + position.totalAmortizedPrincipal,
        netBalance: position.netBalance,
        details: position as unknown as object,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: LOAN_CALCULATION_ENTITY_TYPE,
      entityId: snapshot.id,
      afterData: snapshot,
    });

    return snapshot;
  });
}

export function listInvestorLoanSnapshots(context: AccessContext, investorId: string) {
  return getLoanInvestorScoped(context, investorId).then(() =>
    prisma.speInvestorLoanCalculation.findMany({
      where: { investorId },
      orderBy: { asOfDate: "desc" },
      take: 20,
    }),
  );
}
