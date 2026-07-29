import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { runAuditForOrganization, getIndexFreshnessWarnings } from "@/server/audit";

/**
 * Auditoria de atualização (docs/ESPEC_CONFIABILIDADE_JOBS_AUDITORIA.md,
 * Parte 2) — V1-V5 + persistência em AuditRun/AuditCheckResult. Cada
 * describe usa sua própria organização, pra isolar o estado que cada
 * verificação examina (evita que o fixture de um teste vaze pro cálculo de
 * outro). V5 nunca é exercitado contra a rede real aqui — mesma razão de
 * tests/integration/jobs.test.ts: não depender do Banco Central estar no
 * ar durante o CI.
 */

async function makeOrg(name: string) {
  const org = await prisma.organization.create({ data: { name } });
  const user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@teste.local`, fullName: "Usuário Auditoria" },
  });
  const context: AccessContext = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set() };
  return { org, user, context };
}

async function cleanupOrg(orgId: string, userId: string) {
  await prisma.installmentPayment.deleteMany({ where: { installment: { portfolio: { organizationId: orgId } } } });
  await prisma.financialCalculation.deleteMany({ where: { installment: { portfolio: { organizationId: orgId } } } });
  await prisma.installment.deleteMany({ where: { portfolio: { organizationId: orgId } } });
  await prisma.receivablePortfolio.deleteMany({ where: { organizationId: orgId } });
  await prisma.contract.deleteMany({ where: { organizationId: orgId } });
  await prisma.sale.deleteMany({ where: { organizationId: orgId } });
  await prisma.proposal.deleteMany({ where: { organizationId: orgId } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: orgId } } });
  await prisma.customer.deleteMany({ where: { organizationId: orgId } });
  await prisma.development.deleteMany({ where: { organizationId: orgId } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: orgId } });
  await prisma.indexValue.deleteMany({ where: { indexRule: { organizationId: orgId } } });
  await prisma.indexRule.deleteMany({ where: { organizationId: orgId } });
  await prisma.jobRun.deleteMany({ where: { organizationId: orgId } });
  await prisma.auditCheckResult.deleteMany({ where: { auditRun: { organizationId: orgId } } });
  await prisma.auditRun.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.organization.delete({ where: { id: orgId } });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("V1 — Frescor dos índices", () => {
  it("alerta quando o mês fechado está ausente após o prazo, e some quando o valor é lançado", async () => {
    const { org, user } = await makeOrg("Org — Auditoria V1");
    try {
      // "Hoje" fixo em 25/mar/2026 — depois do prazo padrão dos 3 índices
      // pro mês fechado (fev/2026): IGP-M dia 5, IPCA dia 12, INCC dia 20 de março.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 2, 25));

      const rule = await prisma.indexRule.create({
        data: { organizationId: org.id, code: "INCC", name: "INCC Teste V1", isActive: true },
      });

      const withoutValue = await runAuditForOrganization(org.id, { full: false, triggeredBy: "MANUAL" });
      const v1Alert = withoutValue.checks.find((c) => c.code === "V1_INDEX_FRESHNESS")!;
      expect(v1Alert.status).toBe("ALERT");
      expect(v1Alert.summary.missing).toBe(1);

      const warnings = await getIndexFreshnessWarnings(org.id);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].code).toBe("INCC");
      expect(warnings[0].referenceMonth).toBe("2026-02");

      // Lança o valor faltante — a mesma verificação deve virar OK
      await prisma.indexValue.create({
        data: { indexRuleId: rule.id, referenceMonth: new Date(2026, 1, 1), ratePercent: 0.5, source: "MANUAL" },
      });

      const withValue = await runAuditForOrganization(org.id, { full: false, triggeredBy: "MANUAL" });
      const v1Ok = withValue.checks.find((c) => c.code === "V1_INDEX_FRESHNESS")!;
      expect(v1Ok.status).toBe("OK");

      const warningsAfterFix = await getIndexFreshnessWarnings(org.id);
      expect(warningsAfterFix).toHaveLength(0);
    } finally {
      await cleanupOrg(org.id, user.id);
    }
  });

  it("não alerta antes do prazo de publicação vencer", async () => {
    const { org, user } = await makeOrg("Org — Auditoria V1 Antes do Prazo");
    try {
      // 3/mar/2026 — antes de todos os prazos padrão pro mês fechado (fev/2026)
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 2, 3));

      await prisma.indexRule.create({
        data: { organizationId: org.id, code: "INCC", name: "INCC Teste V1b", isActive: true },
      });

      const result = await runAuditForOrganization(org.id, { full: false, triggeredBy: "MANUAL" });
      const v1 = result.checks.find((c) => c.code === "V1_INDEX_FRESHNESS")!;
      expect(v1.status).toBe("OK");
      expect(v1.summary.rulesCheckedAfterDeadline).toBe(0);
    } finally {
      await cleanupOrg(org.id, user.id);
    }
  });
});

describe("V2 — Cobertura da correção", () => {
  it("alerta parcela em aberto de contrato com correção ativa nunca recalculada, some depois de recalculada", async () => {
    const { org, user } = await makeOrg("Org — Auditoria V2");
    try {
      const rule = await prisma.indexRule.create({
        data: { organizationId: org.id, code: "IPCA", name: "IPCA Teste V2", isActive: true },
      });
      const spe = await prisma.specialPurposeEntity.create({
        data: { organizationId: org.id, name: "SPE V2", document: "63265390000141", status: "ACTIVE" },
      });
      const development = await prisma.development.create({
        data: { organizationId: org.id, speId: spe.id, name: "Empreendimento V2", type: "RESIDENTIAL_BUILDING" },
      });
      const unit = await prisma.unit.create({
        data: { developmentId: development.id, unitType: "APARTMENT", number: "101", status: "SOLD" },
      });
      const customer = await prisma.customer.create({
        data: { organizationId: org.id, type: "INDIVIDUAL", name: "Cliente V2", document: "02654427102" },
      });
      const proposal = await prisma.proposal.create({
        data: {
          organizationId: org.id,
          developmentId: development.id,
          unitId: unit.id,
          customerId: customer.id,
          listPrice: 100000,
          discountPercent: 0,
          salePrice: 100000,
          status: "CONVERTED",
          paymentFlow: {},
        },
      });
      const sale = await prisma.sale.create({
        data: {
          organizationId: org.id,
          developmentId: development.id,
          unitId: unit.id,
          proposalId: proposal.id,
          customerId: customer.id,
          salePrice: 100000,
        },
      });
      const contract = await prisma.contract.create({
        data: {
          organizationId: org.id,
          developmentId: development.id,
          unitId: unit.id,
          saleId: sale.id,
          customerId: customer.id,
          contractNumber: "CT-V2-TESTE",
          indexRuleId: rule.id, // correção ativa
        },
      });
      const portfolio = await prisma.receivablePortfolio.create({
        data: { organizationId: org.id, contractId: contract.id, totalValue: 100000 },
      });
      const installment = await prisma.installment.create({
        data: {
          portfolioId: portfolio.id,
          sequence: 1,
          label: "Parcela única",
          dueDate: new Date("2026-06-01"),
          originalValue: 100000,
          lastCalculatedAt: null, // nunca recalculada
        },
      });

      const uncovered = await runAuditForOrganization(org.id, { full: false, triggeredBy: "MANUAL" });
      const v2Alert = uncovered.checks.find((c) => c.code === "V2_CORRECTION_COVERAGE")!;
      expect(v2Alert.status).toBe("ALERT");
      expect(v2Alert.summary.uncovered).toBe(1);

      // Simula o recálculo do ciclo vigente
      await prisma.installment.update({ where: { id: installment.id }, data: { lastCalculatedAt: new Date() } });

      const covered = await runAuditForOrganization(org.id, { full: false, triggeredBy: "MANUAL" });
      const v2Ok = covered.checks.find((c) => c.code === "V2_CORRECTION_COVERAGE")!;
      expect(v2Ok.status).toBe("OK");
    } finally {
      await cleanupOrg(org.id, user.id);
    }
  });
});

describe("V3 — Consistência da memória (recálculo por caminho independente)", () => {
  it("não alerta quando o valor gravado bate com o recálculo independente, e detecta divergência de 1 centavo", async () => {
    const { org, user } = await makeOrg("Org — Auditoria V3");
    try {
      const spe = await prisma.specialPurposeEntity.create({
        data: { organizationId: org.id, name: "SPE V3", document: "46127017000105", status: "ACTIVE" },
      });
      const development = await prisma.development.create({
        data: { organizationId: org.id, speId: spe.id, name: "Empreendimento V3", type: "RESIDENTIAL_BUILDING" },
      });
      const unit = await prisma.unit.create({
        data: { developmentId: development.id, unitType: "APARTMENT", number: "201", status: "SOLD" },
      });
      const customer = await prisma.customer.create({
        data: { organizationId: org.id, type: "INDIVIDUAL", name: "Cliente V3", document: "02654427102" },
      });
      const proposal = await prisma.proposal.create({
        data: {
          organizationId: org.id,
          developmentId: development.id,
          unitId: unit.id,
          customerId: customer.id,
          listPrice: 1000,
          discountPercent: 0,
          salePrice: 1000,
          status: "CONVERTED",
          paymentFlow: {},
        },
      });
      const sale = await prisma.sale.create({
        data: {
          organizationId: org.id,
          developmentId: development.id,
          unitId: unit.id,
          proposalId: proposal.id,
          customerId: customer.id,
          salePrice: 1000,
        },
      });
      // Contrato SEM índice/juros configurado — corretedValue esperado = originalValue, sem ambiguidade.
      const contract = await prisma.contract.create({
        data: {
          organizationId: org.id,
          developmentId: development.id,
          unitId: unit.id,
          saleId: sale.id,
          customerId: customer.id,
          contractNumber: "CT-V3-TESTE",
        },
      });
      const portfolio = await prisma.receivablePortfolio.create({
        data: { organizationId: org.id, contractId: contract.id, totalValue: 1000 },
      });

      const correctInstallment = await prisma.installment.create({
        data: {
          portfolioId: portfolio.id,
          sequence: 1,
          label: "Parcela correta",
          dueDate: new Date("2026-01-01"),
          originalValue: 1000,
          correctedValue: 1000, // bate com o recálculo independente (sem índice/juros = valor original)
          lastCalculatedAt: new Date("2026-01-01"),
        },
      });
      const wrongInstallment = await prisma.installment.create({
        data: {
          portfolioId: portfolio.id,
          sequence: 2,
          label: "Parcela com bug simulado",
          dueDate: new Date("2026-02-01"),
          originalValue: 1000,
          correctedValue: 1050, // divergente de propósito — simula um bug do motor real
          lastCalculatedAt: new Date("2026-01-01"),
        },
      });

      const result = await runAuditForOrganization(org.id, { full: true, triggeredBy: "MANUAL" });
      const v3 = result.checks.find((c) => c.code === "V3_MEMORY_CONSISTENCY")!;
      expect(v3.status).toBe("ALERT");
      expect(v3.summary.sampled).toBe(2);
      expect(v3.summary.divergent).toBe(1);

      const issues = v3.issues as Array<{ installmentId: string; expected: number; found: number; diff: number }>;
      expect(issues).toHaveLength(1);
      expect(issues[0].installmentId).toBe(wrongInstallment.id);
      expect(issues[0].expected).toBe(1000);
      expect(issues[0].found).toBe(1050);
      expect(issues[0].diff).toBe(50);

      // A parcela correta nunca aparece na lista de divergências
      expect(issues.some((i) => i.installmentId === correctInstallment.id)).toBe(false);
    } finally {
      await cleanupOrg(org.id, user.id);
    }
  });
});

describe("V4 — Execução dos jobs", () => {
  it("alerta quando os jobs agendados não têm JobRun de sucesso recente, some depois de um sucesso registrado", async () => {
    const { org, user } = await makeOrg("Org — Auditoria V4");
    try {
      const missing = await runAuditForOrganization(org.id, { full: false, triggeredBy: "MANUAL" });
      const v4Alert = missing.checks.find((c) => c.code === "V4_JOB_EXECUTION")!;
      expect(v4Alert.status).toBe("ALERT");
      expect(v4Alert.summary.missing).toBe(2); // recalculate-installments e sync-index-values, nenhum rodou ainda

      await prisma.jobRun.create({
        data: { jobName: "recalculate-installments", organizationId: org.id, triggeredBy: "CRON", status: "SUCCESS", finishedAt: new Date() },
      });
      await prisma.jobRun.create({
        data: { jobName: "sync-index-values", organizationId: org.id, triggeredBy: "CRON", status: "SUCCESS", finishedAt: new Date() },
      });

      const covered = await runAuditForOrganization(org.id, { full: false, triggeredBy: "MANUAL" });
      const v4Ok = covered.checks.find((c) => c.code === "V4_JOB_EXECUTION")!;
      expect(v4Ok.status).toBe("OK");
      expect(v4Ok.summary.missing).toBe(0);
    } finally {
      await cleanupOrg(org.id, user.id);
    }
  });
});

describe("V5 — Divergência de fonte (sem tocar rede no CI)", () => {
  it("fica OK sem checar nada quando não há índice oficial ativo com valor gravado", async () => {
    const { org, user } = await makeOrg("Org — Auditoria V5");
    try {
      const result = await runAuditForOrganization(org.id, { full: false, triggeredBy: "MANUAL" });
      const v5 = result.checks.find((c) => c.code === "V5_SOURCE_DIVERGENCE")!;
      expect(v5.status).toBe("OK");
      expect(v5.summary.checked).toBe(0);
    } finally {
      await cleanupOrg(org.id, user.id);
    }
  });
});

describe("Orquestrador — persistência e status geral", () => {
  it("grava AuditRun com status ALERT quando qualquer verificação falha, e persiste os 5 AuditCheckResult", async () => {
    const { org, user } = await makeOrg("Org — Auditoria Orquestrador");
    try {
      // Organização "vazia" já basta pro V4 alertar (nenhum JobRun ainda) — suficiente pra provar a propagação do status geral.
      const result = await runAuditForOrganization(org.id, { full: false, triggeredBy: "CRON" });
      expect(result.status).toBe("ALERT");
      expect(result.checks).toHaveLength(5);

      const persisted = await prisma.auditRun.findUnique({
        where: { id: result.auditRunId },
        include: { checks: true },
      });
      expect(persisted?.status).toBe("ALERT");
      expect(persisted?.triggeredBy).toBe("CRON");
      expect(persisted?.checks).toHaveLength(5);
      expect(persisted?.finishedAt).not.toBeNull();
    } finally {
      await cleanupOrg(org.id, user.id);
    }
  });
});
