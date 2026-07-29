import "server-only";

import { prisma } from "@/lib/prisma";
import { independentlyRecomputeInstallment } from "@/lib/audit-correction-recompute";
import { fetchOfficialIndexRate } from "@/server/index-sources";
import type { JobTrigger, AuditCheckCode, AuditStatus, IndexCode, Prisma } from "@/generated/prisma/client";

/**
 * Auditoria de atualização — o "double-check" (docs/
 * ESPEC_CONFIABILIDADE_JOBS_AUDITORIA.md, Parte 2). Cinco verificações
 * independentes do motor de correção; V2/V3/V5 deliberadamente NÃO
 * reutilizam a função que calcula/sincroniza pra conferir a si mesma —
 * cada uma lê o estado dos dados (ou a fonte oficial) por conta própria.
 */

export type AuditCheckOutcome = {
  status: AuditStatus;
  summary: Record<string, unknown>;
  issues: unknown[];
};

const OFFICIAL_INDEX_CODES: IndexCode[] = ["INCC", "IPCA", "IGPM"];

// Dia do mês SEGUINTE ao de competência até quando o valor deveria estar
// publicado, quando a regra não tem `publicationDeadlineDay` próprio.
// Aproximação do calendário real de publicação do BC/IBGE/FGV — ajustável
// por índice em IndexRule.publicationDeadlineDay quando a TSH observar um
// prazo diferente na prática.
const DEFAULT_PUBLICATION_DEADLINE_DAY: Record<string, number> = {
  IGPM: 5,
  IPCA: 12,
  INCC: 20,
};

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** O cron de correção mensal roda dia 2 (vercel.json) — "ciclo vigente" começa nesse dia. */
function currentCorrectionCycleStart(referenceDate = new Date()) {
  const day = referenceDate.getDate();
  if (day >= 2) return new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 2);
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 2);
}

/** V1 — Frescor dos índices: cada regra oficial ativa tem o mês fechado mais recente lançado até o prazo? */
async function checkV1IndexFreshness(organizationId: string): Promise<AuditCheckOutcome> {
  const rules = await prisma.indexRule.findMany({
    where: { organizationId, isActive: true, code: { in: OFFICIAL_INDEX_CODES } },
  });

  const now = new Date();
  const lastClosedMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const issues: Array<{
    indexRuleId: string;
    indexRuleName: string;
    code: string;
    referenceMonth: string;
    deadline: string;
  }> = [];
  let checked = 0;

  for (const rule of rules) {
    const deadlineDay = rule.publicationDeadlineDay ?? DEFAULT_PUBLICATION_DEADLINE_DAY[rule.code] ?? 20;
    const deadline = new Date(lastClosedMonth.getFullYear(), lastClosedMonth.getMonth() + 1, deadlineDay);
    if (now < deadline) continue; // prazo ainda não vencido — não cobra ainda
    checked += 1;

    const value = await prisma.indexValue.findFirst({
      where: { indexRuleId: rule.id, referenceMonth: lastClosedMonth },
    });
    if (!value) {
      issues.push({
        indexRuleId: rule.id,
        indexRuleName: rule.name,
        code: rule.code,
        referenceMonth: monthKey(lastClosedMonth),
        deadline: deadline.toISOString(),
      });
    }
  }

  return {
    status: issues.length > 0 ? "ALERT" : "OK",
    summary: { rulesCheckedAfterDeadline: checked, missing: issues.length },
    issues,
  };
}

/** V2 — Cobertura da correção: toda parcela em aberto de contrato com correção ativa foi recalculada no ciclo vigente? Varre as parcelas, não o log do cron. */
async function checkV2CorrectionCoverage(organizationId: string): Promise<AuditCheckOutcome> {
  const cycleStart = currentCorrectionCycleStart();

  const openInstallments = await prisma.installment.findMany({
    where: {
      status: { notIn: ["PAID", "CANCELLED"] },
      portfolio: {
        organizationId,
        contract: {
          OR: [{ indexRuleId: { not: null } }, { development: { postHabiteSeIndexRuleId: { not: null } } }],
        },
      },
    },
    select: {
      id: true,
      dueDate: true,
      lastCalculatedAt: true,
      portfolio: { select: { contract: { select: { contractNumber: true } } } },
    },
  });

  const issues = openInstallments
    .filter((i) => !i.lastCalculatedAt || i.lastCalculatedAt < cycleStart)
    .map((i) => ({
      installmentId: i.id,
      contractNumber: i.portfolio.contract.contractNumber,
      dueDate: i.dueDate.toISOString(),
      lastCalculatedAt: i.lastCalculatedAt?.toISOString() ?? null,
    }));

  return {
    status: issues.length > 0 ? "ALERT" : "OK",
    summary: { checked: openInstallments.length, uncovered: issues.length, cycleStart: cycleStart.toISOString() },
    issues,
  };
}

/**
 * V3 — Consistência da memória: recalcula por caminho de código
 * INDEPENDENTE (src/lib/audit-correction-recompute.ts, nunca importa nada
 * do motor real) e compara contra o correctedValue já gravado. Usa como
 * `asOfDate` o `lastCalculatedAt` da própria parcela — compara "o que o
 * motor calculou" contra "o que uma implementação separada calcularia com
 * os MESMOS dados", não contra um valor mais novo (isso é o trabalho do
 * V2, cobertura/frescor, não do V3, correção do cálculo em si).
 */
async function checkV3MemoryConsistency(organizationId: string, full: boolean): Promise<AuditCheckOutcome> {
  const where: Prisma.InstallmentWhereInput = {
    status: { notIn: ["PAID", "CANCELLED"] },
    lastCalculatedAt: { not: null },
    portfolio: { organizationId },
  };

  const total = await prisma.installment.count({ where });
  const sampleSize = full ? total : Math.min(total, 50);

  const installments = await prisma.installment.findMany({
    where,
    take: sampleSize,
    orderBy: { id: "asc" },
    include: {
      portfolio: {
        include: {
          contract: {
            include: {
              indexRule: { include: { values: true } },
              development: { include: { postHabiteSeIndexRule: { include: { values: true } } } },
            },
          },
        },
      },
    },
  });

  const issues: Array<{
    installmentId: string;
    contractNumber: string;
    expected: number;
    found: number;
    diff: number;
  }> = [];

  for (const installment of installments) {
    const contract = installment.portfolio.contract;
    const development = contract.development;
    const baseMonth = contract.signedAt ?? contract.issuedAt;

    const recomputed = independentlyRecomputeInstallment({
      originalValue: Number(installment.originalValue),
      baseMonth,
      dueDate: installment.dueDate,
      asOfDate: installment.lastCalculatedAt ?? installment.dueDate,
      habiteSeDate: development.habiteSeDate,
      preHabiteSe: {
        indexValues: (contract.indexRule?.values ?? []).map((v) => ({
          referenceMonth: v.referenceMonth,
          ratePercent: Number(v.ratePercent),
        })),
        monthlyInterestPercent: contract.monthlyInterestPercent ? Number(contract.monthlyInterestPercent) : null,
        interestType: contract.interestType,
      },
      postHabiteSe: development.postHabiteSeIndexRule
        ? {
            indexValues: development.postHabiteSeIndexRule.values.map((v) => ({
              referenceMonth: v.referenceMonth,
              ratePercent: Number(v.ratePercent),
            })),
            monthlyInterestPercent: development.postHabiteSeMonthlyInterestPercent
              ? Number(development.postHabiteSeMonthlyInterestPercent)
              : null,
            interestType: development.postHabiteSeInterestType,
          }
        : null,
      latePaymentFinePercent: Number(contract.latePaymentFinePercent),
      latePaymentMonthlyInterestPercent: Number(contract.latePaymentMonthlyInterestPercent),
    });

    const stored = Number(installment.correctedValue ?? installment.originalValue);
    const diff = round2(Math.abs(recomputed.correctedValue - stored));
    if (diff >= 0.01) {
      issues.push({
        installmentId: installment.id,
        contractNumber: contract.contractNumber,
        expected: recomputed.correctedValue,
        found: stored,
        diff,
      });
    }
  }

  return {
    status: issues.length > 0 ? "ALERT" : "OK",
    summary: { sampled: installments.length, total, full, divergent: issues.length },
    issues,
  };
}

/** V4 — Execução dos jobs: os jobs agendados têm JobRun de sucesso dentro do período esperado? */
const JOB_EXPECTED_CADENCE_DAYS: Record<string, number> = {
  "recalculate-installments": 35, // mensal (dia 2) + folga
  "sync-index-values": 8, // semanal + folga
};

async function checkV4JobExecution(organizationId: string): Promise<AuditCheckOutcome> {
  const issues: Array<{ jobName: string; cadenceDays: number; message: string }> = [];

  for (const [jobName, cadenceDays] of Object.entries(JOB_EXPECTED_CADENCE_DAYS)) {
    const since = new Date(Date.now() - cadenceDays * 24 * 60 * 60 * 1000);
    const success = await prisma.jobRun.findFirst({
      where: { organizationId, jobName, status: "SUCCESS", startedAt: { gte: since } },
    });
    if (!success) {
      issues.push({
        jobName,
        cadenceDays,
        message: `Sem execução de sucesso do job "${jobName}" nos últimos ${cadenceDays} dias.`,
      });
    }
  }

  return {
    status: issues.length > 0 ? "ALERT" : "OK",
    summary: { checked: Object.keys(JOB_EXPECTED_CADENCE_DAYS).length, missing: issues.length },
    issues,
  };
}

/** V5 — Divergência de fonte: o valor gravado bate com uma nova consulta direta à API do Banco Central (não confia no que o sync já gravou)? */
async function checkV5SourceDivergence(organizationId: string): Promise<AuditCheckOutcome> {
  const rules = await prisma.indexRule.findMany({
    where: { organizationId, isActive: true, code: { in: OFFICIAL_INDEX_CODES } },
  });

  const now = new Date();
  const monthsToCheck = [1, 2, 3].map((n) => new Date(now.getFullYear(), now.getMonth() - n, 1));

  const issues: Array<{
    indexRuleId: string;
    indexRuleName?: string;
    month: string;
    stored?: number;
    official?: number;
    diff?: number;
    error?: string;
  }> = [];
  let checked = 0;

  for (const rule of rules) {
    const storedValues = await prisma.indexValue.findMany({
      where: { indexRuleId: rule.id, referenceMonth: { in: monthsToCheck } },
    });

    for (const month of monthsToCheck) {
      const stored = storedValues.find((v) => v.referenceMonth.getTime() === month.getTime());
      if (!stored) continue; // sem valor gravado ainda — isso é assunto do V1, não divergência de fonte

      let official: number | null;
      try {
        official = await fetchOfficialIndexRate(rule.code, month);
      } catch (error) {
        issues.push({
          indexRuleId: rule.id,
          indexRuleName: rule.name,
          month: monthKey(month),
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (official === null) continue; // BC sem publicação pro mês — sem base de comparação

      checked += 1;
      const diff = round2(Math.abs(official - Number(stored.ratePercent)));
      if (diff >= 0.01) {
        issues.push({
          indexRuleId: rule.id,
          indexRuleName: rule.name,
          month: monthKey(month),
          stored: Number(stored.ratePercent),
          official,
          diff,
        });
      }
    }
  }

  return {
    status: issues.length > 0 ? "ALERT" : "OK",
    summary: { checked, divergent: issues.length },
    issues,
  };
}

const CHECKS: Array<{ code: AuditCheckCode; run: (organizationId: string, full: boolean) => Promise<AuditCheckOutcome> }> = [
  { code: "V1_INDEX_FRESHNESS", run: (organizationId) => checkV1IndexFreshness(organizationId) },
  { code: "V2_CORRECTION_COVERAGE", run: (organizationId) => checkV2CorrectionCoverage(organizationId) },
  { code: "V3_MEMORY_CONSISTENCY", run: (organizationId, full) => checkV3MemoryConsistency(organizationId, full) },
  { code: "V4_JOB_EXECUTION", run: (organizationId) => checkV4JobExecution(organizationId) },
  { code: "V5_SOURCE_DIVERGENCE", run: (organizationId) => checkV5SourceDivergence(organizationId) },
];

export async function runAuditForOrganization(
  organizationId: string,
  options: { full?: boolean; triggeredBy: JobTrigger },
) {
  const full = options.full ?? false;

  const auditRun = await prisma.auditRun.create({
    data: { organizationId, triggeredBy: options.triggeredBy, fullCheck: full, status: "OK" },
  });

  let overallStatus: AuditStatus = "OK";
  const results: Array<{ code: AuditCheckCode } & AuditCheckOutcome> = [];

  for (const check of CHECKS) {
    let outcome: AuditCheckOutcome;
    try {
      outcome = await check.run(organizationId, full);
    } catch (error) {
      outcome = {
        status: "ALERT",
        summary: { error: error instanceof Error ? error.message : String(error) },
        issues: [],
      };
    }
    if (outcome.status === "ALERT") overallStatus = "ALERT";

    await prisma.auditCheckResult.create({
      data: {
        auditRunId: auditRun.id,
        code: check.code,
        status: outcome.status,
        summary: outcome.summary as Prisma.InputJsonValue,
        issues: outcome.issues as Prisma.InputJsonValue,
      },
    });

    results.push({ code: check.code, ...outcome });
  }

  await prisma.auditRun.update({
    where: { id: auditRun.id },
    data: { status: overallStatus, finishedAt: new Date() },
  });

  return { auditRunId: auditRun.id, status: overallStatus, checks: results };
}

export async function getLatestAuditRun(organizationId: string) {
  const auditRun = await prisma.auditRun.findFirst({
    where: { organizationId },
    orderBy: { startedAt: "desc" },
    include: { checks: true },
  });
  return auditRun;
}

export async function listAuditRuns(organizationId: string, params: { page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? 20;

  const [items, total] = await Promise.all([
    prisma.auditRun.findMany({
      where: { organizationId },
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { checks: true },
    }),
    prisma.auditRun.count({ where: { organizationId } }),
  ]);

  return { items, total, page, pageSize };
}

export async function getAuditRunDetail(organizationId: string, auditRunId: string) {
  return prisma.auditRun.findFirst({
    where: { id: auditRunId, organizationId },
    include: { checks: true },
  });
}

/**
 * Regra de bloqueio prudente do V1 (Parte 2.4): se o índice do mês estiver
 * ausente após o prazo, toda tela que exiba valor corrigido deve avisar em
 * vez de mostrar número silenciosamente desatualizado. Lê o V1 mais recente
 * (não recalcula na hora — a auditoria já roda diariamente/sob demanda).
 */
export async function getIndexFreshnessWarnings(organizationId: string) {
  const latestRun = await prisma.auditRun.findFirst({
    where: { organizationId },
    orderBy: { startedAt: "desc" },
    include: { checks: { where: { code: "V1_INDEX_FRESHNESS" } } },
  });
  const v1 = latestRun?.checks[0];
  if (!v1 || v1.status !== "ALERT") return [];

  const issues = (v1.issues as Array<{ indexRuleName: string; code: string; referenceMonth: string }>) ?? [];
  return issues.map((issue) => ({
    indexRuleName: issue.indexRuleName,
    code: issue.code,
    referenceMonth: issue.referenceMonth,
  }));
}
