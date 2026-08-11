import "server-only";

import { prisma } from "@/lib/prisma";
import { getInstallmentLivePosition } from "@/server/receivables";
import { getEffectiveCollectionSteps, resolveCollectionStage, type CollectionStep } from "@/server/collection-rules";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function daysBetween(a: Date, b: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((b.getTime() - a.getTime()) / msPerDay);
}

export type AgingBucketKey = "A_VENCER_30D" | "D1_15" | "D16_30" | "D31_60" | "D61_90" | "D90_PLUS";

export const AGING_BUCKET_ORDER: AgingBucketKey[] = ["A_VENCER_30D", "D1_15", "D16_30", "D31_60", "D61_90", "D90_PLUS"];

export const AGING_BUCKET_LABELS: Record<AgingBucketKey, string> = {
  A_VENCER_30D: "A vencer (30d)",
  D1_15: "1–15d",
  D16_30: "16–30d",
  D31_60: "31–60d",
  D61_90: "61–90d",
  D90_PLUS: "+90d",
};

function bucketFor(daysOverdue: number, daysUntilDue: number): AgingBucketKey | null {
  if (daysOverdue <= 0) {
    return daysUntilDue <= 30 ? "A_VENCER_30D" : null;
  }
  if (daysOverdue <= 15) return "D1_15";
  if (daysOverdue <= 30) return "D16_30";
  if (daysOverdue <= 60) return "D31_60";
  if (daysOverdue <= 90) return "D61_90";
  return "D90_PLUS";
}

export type AgingRow = {
  installmentId: string;
  contractId: string;
  saleId: string;
  contractNumber: string;
  customerId: string;
  customerName: string;
  developmentId: string;
  developmentName: string;
  unitNumber: string;
  label: string;
  dueDate: Date;
  daysOverdue: number;
  resultValue: number;
  bucket: AgingBucketKey;
};

export type AgingBucketSummary = {
  bucket: AgingBucketKey;
  label: string;
  totalValue: number;
  installmentCount: number;
  customerCount: number;
};

export type AgingFilters = {
  developmentId?: string;
  speId?: string;
  minValue?: number;
  maxValue?: number;
};

/**
 * Aging da carteira (Fase B, Parte 3.1) — agrupa os títulos vencidos (+ os
 * "a vencer" nos próximos 30 dias) por faixa de atraso. Valor de cada
 * parcela calculado AO VIVO (`getInstallmentLivePosition`, mesmo princípio
 * da etapa 1: exibição, não recálculo persistido).
 */
export async function getPortfolioAging(organizationId: string, filters: AgingFilters = {}) {
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const installments = await prisma.installment.findMany({
    where: {
      portfolio: {
        organizationId,
        ...(filters.developmentId ? { contract: { developmentId: filters.developmentId } } : {}),
      },
      status: { notIn: ["PAID", "CANCELLED"] },
      dueDate: { lte: horizon },
    },
    include: {
      portfolio: {
        include: {
          contract: {
            include: {
              customer: true,
              unit: true,
              development: { include: { spe: true, postHabiteSeIndexRule: { include: { values: true } } } },
              indexRule: { include: { values: true } },
            },
          },
        },
      },
    },
  });

  const rows: AgingRow[] = [];
  for (const installment of installments) {
    const contract = installment.portfolio.contract;
    if (filters.speId && contract.development.spe.id !== filters.speId) continue;

    const position = getInstallmentLivePosition(
      {
        status: installment.status,
        originalValue: Number(installment.originalValue),
        correctedValue: installment.correctedValue ? Number(installment.correctedValue) : null,
        lastCalculatedAt: installment.lastCalculatedAt,
        dueDate: installment.dueDate,
      },
      contract,
      contract.development,
      now,
    );

    if (filters.minValue !== undefined && position.resultValue < filters.minValue) continue;
    if (filters.maxValue !== undefined && position.resultValue > filters.maxValue) continue;

    const daysUntilDue = daysBetween(now, installment.dueDate);
    const bucket = bucketFor(position.daysOverdue, daysUntilDue);
    if (!bucket) continue;

    rows.push({
      installmentId: installment.id,
      contractId: contract.id,
      saleId: contract.saleId,
      contractNumber: contract.contractNumber,
      customerId: contract.customer.id,
      customerName: contract.customer.name,
      developmentId: contract.developmentId,
      developmentName: contract.development.name,
      unitNumber: contract.unit.number,
      label: installment.label,
      dueDate: installment.dueDate,
      daysOverdue: position.daysOverdue,
      resultValue: position.resultValue,
      bucket,
    });
  }

  const summaries: AgingBucketSummary[] = AGING_BUCKET_ORDER.map((bucket) => {
    const bucketRows = rows.filter((r) => r.bucket === bucket);
    return {
      bucket,
      label: AGING_BUCKET_LABELS[bucket],
      totalValue: round2(bucketRows.reduce((sum, r) => sum + r.resultValue, 0)),
      installmentCount: bucketRows.length,
      customerCount: new Set(bucketRows.map((r) => r.customerId)).size,
    };
  });

  return { asOfDate: now, summaries, rows };
}

export type CustomerCollectionStage = {
  customerId: string;
  customerName: string;
  worstDaysOverdue: number;
  currentStep: CollectionStep | null;
  nextStep: CollectionStep | null;
  developmentId: string;
};

/**
 * Em qual etapa da régua cada cliente inadimplente está, e a próxima ação
 * sugerida (Fase B, Parte 3.2) — calculado a partir da parcela mais
 * atrasada do cliente (pior caso), usando a régua do empreendimento dessa
 * parcela. Cliente com parcelas em atraso em mais de um empreendimento:
 * decisão de escopo — usa a régua do empreendimento da parcela mais
 * atrasada, não uma fusão entre réguas de empreendimentos diferentes.
 */
export async function getOverdueCustomerStages(organizationId: string): Promise<CustomerCollectionStage[]> {
  const now = new Date();
  const overdueInstallments = await prisma.installment.findMany({
    where: { portfolio: { organizationId }, status: { notIn: ["PAID", "CANCELLED"] }, dueDate: { lt: now } },
    include: {
      portfolio: {
        include: {
          contract: {
            include: { customer: true, indexRule: { include: { values: true } }, development: { include: { postHabiteSeIndexRule: { include: { values: true } } } } },
          },
        },
      },
    },
  });

  const worstByCustomer = new Map<string, { daysOverdue: number; developmentId: string; customerName: string }>();
  for (const installment of overdueInstallments) {
    const contract = installment.portfolio.contract;
    const position = getInstallmentLivePosition(
      {
        status: installment.status,
        originalValue: Number(installment.originalValue),
        correctedValue: installment.correctedValue ? Number(installment.correctedValue) : null,
        lastCalculatedAt: installment.lastCalculatedAt,
        dueDate: installment.dueDate,
      },
      contract,
      contract.development,
      now,
    );
    if (position.daysOverdue <= 0) continue;

    const existing = worstByCustomer.get(contract.customer.id);
    if (!existing || position.daysOverdue > existing.daysOverdue) {
      worstByCustomer.set(contract.customer.id, {
        daysOverdue: position.daysOverdue,
        developmentId: contract.developmentId,
        customerName: contract.customer.name,
      });
    }
  }

  const stepsByDevelopment = new Map<string, CollectionStep[]>();
  const result: CustomerCollectionStage[] = [];
  for (const [customerId, worst] of worstByCustomer.entries()) {
    if (!stepsByDevelopment.has(worst.developmentId)) {
      stepsByDevelopment.set(worst.developmentId, await getEffectiveCollectionSteps(worst.developmentId));
    }
    const steps = stepsByDevelopment.get(worst.developmentId)!;
    const { currentStep, nextStep } = resolveCollectionStage(steps, worst.daysOverdue);
    result.push({
      customerId,
      customerName: worst.customerName,
      worstDaysOverdue: worst.daysOverdue,
      currentStep,
      nextStep,
      developmentId: worst.developmentId,
    });
  }

  return result.sort((a, b) => b.worstDaysOverdue - a.worstDaysOverdue);
}

/** Régua de um único cliente — usado no extrato do cliente e no drill-down do painel. */
export async function getCustomerCollectionStage(organizationId: string, customerId: string): Promise<CustomerCollectionStage | null> {
  const stages = await getOverdueCustomerStages(organizationId);
  return stages.find((s) => s.customerId === customerId) ?? null;
}
