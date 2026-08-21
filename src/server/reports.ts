import "server-only";

import { prisma } from "@/lib/prisma";
import { getCashFlow } from "@/server/cash-flow";
import { resolvePayableDestinations } from "@/server/payable-allocations";
import type { AccessContext } from "@/server/auth-context";
import { canAccessDevelopment } from "@/server/scope";

// Relatórios executivos (Sprint 9, PRD seção 22 e 28). Reaproveitam os dados
// já modelados nas sprints anteriores — nenhuma tabela nova. "Mapa de vendas"
// visual (por torre/pavimento) já existe em /developments/[id]/map; aqui
// entram as visões agregadas (contagens e totais) que faltavam.

export type InventoryStatusRow = { status: string; count: number; value: number };

export async function getInventoryPosition(organizationId: string, developmentId?: string) {
  const units = await prisma.unit.findMany({
    where: {
      isAccessory: false,
      development: { organizationId, id: developmentId },
    },
    select: { status: true, referenceValue: true },
  });

  const byStatus = new Map<string, InventoryStatusRow>();
  let totalUnits = 0;
  let totalValue = 0;

  for (const unit of units) {
    const value = Number(unit.referenceValue ?? 0);
    const row = byStatus.get(unit.status) ?? { status: unit.status, count: 0, value: 0 };
    row.count += 1;
    row.value += value;
    byStatus.set(unit.status, row);
    totalUnits += 1;
    totalValue += value;
  }

  return {
    rows: [...byStatus.values()].sort((a, b) => b.count - a.count),
    totalUnits,
    totalValue: round2(totalValue),
  };
}

export async function getSalesSummary(organizationId: string, developmentId?: string) {
  const [inventory, sales] = await Promise.all([
    getInventoryPosition(organizationId, developmentId),
    prisma.sale.findMany({
      where: { organizationId, developmentId, status: "ACTIVE" },
      select: { salePrice: true },
    }),
  ]);

  const vgvSold = sales.reduce((sum, sale) => sum + Number(sale.salePrice), 0);
  const unitsSoldCount = sales.length;

  return {
    vgvTotal: inventory.totalValue,
    vgvSold: round2(vgvSold),
    vgvAvailable: round2(inventory.totalValue - vgvSold),
    percentSold: inventory.totalUnits > 0 ? round2((unitsSoldCount / inventory.totalUnits) * 100) : 0,
    unitsTotal: inventory.totalUnits,
    unitsSold: unitsSoldCount,
    averageTicket: unitsSoldCount > 0 ? round2(vgvSold / unitsSoldCount) : 0,
  };
}

export async function getReceivablesSummary(organizationId: string, developmentId?: string) {
  const contractFilter = developmentId ? { developmentId } : undefined;

  const [payments, openInstallments, overdueInstallments] = await Promise.all([
    prisma.installmentPayment.findMany({
      where: { installment: { portfolio: { organizationId, contract: contractFilter } } },
      select: { amount: true },
    }),
    prisma.installment.findMany({
      where: {
        status: { notIn: ["PAID", "CANCELLED"] },
        portfolio: { organizationId, contract: contractFilter },
      },
      select: { originalValue: true, correctedValue: true, paidAmount: true },
    }),
    prisma.installment.findMany({
      where: { status: "OVERDUE", portfolio: { organizationId, contract: contractFilter } },
      select: { originalValue: true, correctedValue: true, paidAmount: true },
    }),
  ]);

  const totalReceived = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const totalOutstanding = openInstallments.reduce(
    (sum, installment) =>
      sum + (Number(installment.correctedValue ?? installment.originalValue) - Number(installment.paidAmount)),
    0,
  );
  const overdueAmount = overdueInstallments.reduce(
    (sum, installment) =>
      sum + (Number(installment.correctedValue ?? installment.originalValue) - Number(installment.paidAmount)),
    0,
  );

  return {
    totalReceived: round2(totalReceived),
    totalOutstanding: round2(totalOutstanding),
    overdueAmount: round2(overdueAmount),
    overdueCount: overdueInstallments.length,
  };
}

/**
 * Soma contas a pagar por status — quando `developmentId` é passado, soma só
 * a fração rateada pra aquele empreendimento (Fase B, Parte 4.2), nunca o
 * valor cheio da conta; sem `developmentId` (visão da organização inteira) a
 * soma de todos os destinos de uma conta sempre fecha no valor total, então
 * o resultado bate com o comportamento anterior ao rateio.
 */
export async function getPayablesSummary(organizationId: string, developmentId?: string) {
  const payables = await prisma.payable.findMany({
    where: { organizationId, status: { not: "CANCELLED" } },
    select: {
      amount: true,
      paidAmount: true,
      status: true,
      developmentId: true,
      allocations: { select: { developmentId: true, amount: true } },
    },
  });

  let totalPaid = 0;
  let totalPending = 0;
  let count = 0;
  for (const payable of payables) {
    const destinations = resolvePayableDestinations(payable);
    const relevant = developmentId ? destinations.filter((d) => d.developmentId === developmentId) : destinations;
    if (relevant.length === 0) continue;
    const sum = relevant.reduce((acc, d) => acc + d.amount, 0);
    count += 1;
    if (payable.status === "PAID" || payable.status === "RECONCILED") totalPaid += sum;
    else totalPending += sum;
  }

  return {
    totalPaid: round2(totalPaid),
    totalPending: round2(totalPending),
    count,
  };
}

/**
 * Relatório do investidor (PRD seção 21) — resumo executivo de um
 * empreendimento. Não modela participação/aporte de investidor ainda (Fase
 * 13, fora do V1); é a consolidação dos números já existentes, o que já
 * cobre o essencial pedido no PRD (estoque, vendas, carteira, despesas,
 * fluxo de caixa).
 */
export async function getInvestorReport(context: AccessContext, developmentId: string) {
  if (!canAccessDevelopment(context, developmentId)) {
    throw new Error("Empreendimento inválido.");
  }
  const organizationId = context.organizationId;

  const [development, sales, receivables, payables, cashFlow] = await Promise.all([
    prisma.development.findFirst({
      where: { id: developmentId, organizationId },
      include: { spe: true },
    }),
    getSalesSummary(organizationId, developmentId),
    getReceivablesSummary(organizationId, developmentId),
    getPayablesSummary(organizationId, developmentId),
    getCashFlow(context, { developmentId, monthsBack: 1, monthsForward: 3 }),
  ]);

  if (!development) throw new Error("Empreendimento inválido.");

  return { development, sales, receivables, payables, cashFlow };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
