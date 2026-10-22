import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { runAuditForOrganization, getIndexFreshnessWarnings } from "@/server/audit";
import { recalculateInstallment } from "@/server/receivables";

/**
 * Auditoria de atualização (docs/ESPEC_CONFIABILIDADE_JOBS_AUDITORIA.md,
 * Parte 2) — V1-V6 + persistência em AuditRun/AuditCheckResult. Cada
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
  const context: AccessContext = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set(), developmentAccess: "ALL" };
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

/** Contrato + carteira mínimos (multa/mora no default do schema: 2% e 1%/mês). */
async function makeContractWithPortfolio(orgId: string, tag: string) {
  const spe = await prisma.specialPurposeEntity.create({
    data: { organizationId: orgId, name: `SPE ${tag}`, document: "46127017000105", status: "ACTIVE" },
  });
  const development = await prisma.development.create({
    data: { organizationId: orgId, speId: spe.id, name: `Empreendimento ${tag}`, type: "RESIDENTIAL_BUILDING" },
  });
  const unit = await prisma.unit.create({
    data: { developmentId: development.id, unitType: "APARTMENT", number: "101", status: "SOLD" },
  });
  const customer = await prisma.customer.create({
    data: { organizationId: orgId, type: "INDIVIDUAL", name: `Cliente ${tag}`, document: "02654427102" },
  });
  const proposal = await prisma.proposal.create({
    data: {
      organizationId: orgId,
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
      organizationId: orgId,
      developmentId: development.id,
      unitId: unit.id,
      proposalId: proposal.id,
      customerId: customer.id,
      saleNumber: `V-${tag}`,
      salePrice: 1000,
    },
  });
  const contract = await prisma.contract.create({
    data: {
      organizationId: orgId,
      developmentId: development.id,
      unitId: unit.id,
      saleId: sale.id,
      customerId: customer.id,
      contractNumber: `CT-${tag}`,
      issuedAt: new Date("2010-01-01"),
    },
  });
  const portfolio = await prisma.receivablePortfolio.create({
    data: { organizationId: orgId, contractId: contract.id, totalValue: 1000 },
  });
  return { contract, portfolio };
}

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
          saleNumber: "V-TEST-0001",
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
          saleNumber: "V-TEST-0001",
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

  it("não alerta parcela vencida (com multa + mora) calculada corretamente pelo motor real — regressão do bug achado em 2026-09-18 (V3 comparava correctedValue sem multa/mora contra o resultValue gravado, dava ALERT falso em toda parcela vencida)", async () => {
    const { org, user } = await makeOrg("Org — Auditoria V3 — Parcela Vencida");
    try {
      const spe = await prisma.specialPurposeEntity.create({
        data: { organizationId: org.id, name: "SPE V3 Vencida", document: "46127017000105", status: "ACTIVE" },
      });
      const development = await prisma.development.create({
        data: { organizationId: org.id, speId: spe.id, name: "Empreendimento V3 Vencida", type: "RESIDENTIAL_BUILDING" },
      });
      const unit = await prisma.unit.create({
        data: { developmentId: development.id, unitType: "APARTMENT", number: "301", status: "SOLD" },
      });
      const customer = await prisma.customer.create({
        data: { organizationId: org.id, type: "INDIVIDUAL", name: "Cliente V3 Vencida", document: "02654427102" },
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
          saleNumber: "V-TEST-VENCIDA",
          salePrice: 1000,
        },
      });
      const contract = await prisma.contract.create({
        data: {
          organizationId: org.id,
          developmentId: development.id,
          unitId: unit.id,
          saleId: sale.id,
          customerId: customer.id,
          contractNumber: "CT-V3-VENCIDA",
          issuedAt: new Date("2010-01-01"),
          // latePaymentFinePercent/latePaymentMonthlyInterestPercent ficam
          // no default do schema (2% multa, 1%/mês mora) — de propósito,
          // pra garantir que a parcela vencida abaixo tenha multa+mora
          // não-zero (é exatamente essa combinação que expunha o bug).
        },
      });
      const portfolio = await prisma.receivablePortfolio.create({
        data: { organizationId: org.id, contractId: contract.id, totalValue: 1000 },
      });
      const overdueInstallment = await prisma.installment.create({
        data: {
          portfolioId: portfolio.id,
          sequence: 1,
          label: "Parcela vencida",
          dueDate: new Date("2020-01-01"), // bem vencida — garante multa+mora não-zero
          originalValue: 1000,
        },
      });

      // Usa o motor real (não um valor calculado à mão) pra gravar
      // correctedValue — o mesmo caminho que recalculateAllOpenInstallments
      // usa em produção.
      await prisma.$transaction((tx) => recalculateInstallment(tx, overdueInstallment.id));

      const result = await runAuditForOrganization(org.id, { full: true, triggeredBy: "MANUAL" });
      const v3 = result.checks.find((c) => c.code === "V3_MEMORY_CONSISTENCY")!;
      expect(v3.status).toBe("OK");
      expect(v3.summary.divergent).toBe(0);
    } finally {
      await cleanupOrg(org.id, user.id);
    }
  });
});

describe("V3 — amostragem da auditoria semanal (não completa)", () => {
  it("confere SEMPRE toda parcela vencida, mesmo fora das primeiras 50 por id — erro de 1 centavo plantado numa vencida é pego pela semanal, não só pela completa", async () => {
    const { org, user } = await makeOrg("Org — Auditoria V3 — Amostragem");
    try {
      const { portfolio } = await makeContractWithPortfolio(org.id, "V3-AMOSTRA");

      // 60 parcelas não vencidas, corretas (sem índice/juros: valor = original).
      await prisma.installment.createMany({
        data: Array.from({ length: 60 }, (_, i) => ({
          portfolioId: portfolio.id,
          sequence: i + 1,
          label: `Parcela ${i + 1}`,
          dueDate: new Date("2030-01-01"),
          originalValue: 1000,
          correctedValue: 1000,
          lastCalculatedAt: new Date("2026-01-01"),
        })),
      });

      // Vencida com id forçado pro fim da ordenação — a amostra fixa antiga
      // (primeiras 50 por id) nunca chegaria nela.
      const overdue = await prisma.installment.create({
        data: {
          id: `ffffffff${crypto.randomUUID().slice(8)}`,
          portfolioId: portfolio.id,
          sequence: 61,
          label: "Parcela vencida",
          dueDate: new Date("2020-01-01"),
          originalValue: 1000,
        },
      });
      await prisma.$transaction((tx) => recalculateInstallment(tx, overdue.id));

      const clean = await runAuditForOrganization(org.id, { full: false, triggeredBy: "MANUAL" });
      const v3Clean = clean.checks.find((c) => c.code === "V3_MEMORY_CONSISTENCY")!;
      expect(v3Clean.status).toBe("OK");
      expect(v3Clean.summary).toMatchObject({ total: 61, full: false, overdueChecked: 1, randomSampled: 50, sampled: 51 });

      // Erro plantado: 1 centavo a mais no valor gravado da vencida.
      const stored = await prisma.installment.findUniqueOrThrow({ where: { id: overdue.id } });
      await prisma.installment.update({
        where: { id: overdue.id },
        data: { correctedValue: Number(stored.correctedValue) + 0.01 },
      });

      const planted = await runAuditForOrganization(org.id, { full: false, triggeredBy: "MANUAL" });
      const v3Planted = planted.checks.find((c) => c.code === "V3_MEMORY_CONSISTENCY")!;
      expect(v3Planted.status).toBe("ALERT");
      const issues = v3Planted.issues as Array<{ installmentId: string; diff: number }>;
      expect(issues).toHaveLength(1);
      expect(issues[0].installmentId).toBe(overdue.id);
      expect(issues[0].diff).toBe(0.01);
    } finally {
      await cleanupOrg(org.id, user.id);
    }
  });

  it("sorteia o restante em vez de pegar sempre as primeiras por id", async () => {
    const { org, user } = await makeOrg("Org — Auditoria V3 — Sorteio");
    try {
      const { portfolio } = await makeContractWithPortfolio(org.id, "V3-SORTEIO");
      await prisma.installment.createMany({
        data: Array.from({ length: 120 }, (_, i) => ({
          portfolioId: portfolio.id,
          sequence: i + 1,
          label: `Parcela ${i + 1}`,
          dueDate: new Date("2030-01-01"),
          originalValue: 1000,
          correctedValue: 1000,
          lastCalculatedAt: new Date("2026-01-01"),
        })),
      });

      // Erro plantado numa parcela qualquer: com sorteio de 50 em 120, a
      // chance de ela nunca sair em 25 execuções é (70/120)^25 ≈ 1,4 em 1
      // milhão (falso vermelho desprezível); com a amostra fixa antiga, fora
      // das 50 primeiras, a chance de sair era zero.
      const all = await prisma.installment.findMany({ where: { portfolioId: portfolio.id }, orderBy: { id: "asc" } });
      const target = all[all.length - 1]; // a última por id — nunca entraria na amostra fixa antiga
      await prisma.installment.update({ where: { id: target.id }, data: { correctedValue: 1000.01 } });

      let caught = false;
      for (let run = 0; run < 25 && !caught; run++) {
        const result = await runAuditForOrganization(org.id, { full: false, triggeredBy: "MANUAL" });
        const v3 = result.checks.find((c) => c.code === "V3_MEMORY_CONSISTENCY")!;
        expect(v3.summary).toMatchObject({ overdueChecked: 0, randomSampled: 50, sampled: 50 });
        caught = v3.status === "ALERT";
      }
      expect(caught).toBe(true);
    } finally {
      await cleanupOrg(org.id, user.id);
    }
  });
});

describe("V4 — tolerância do recalculate-installments (job diário)", () => {
  it("acusa sem SUCCESS há mais de 3 dias e aceita SUCCESS de 2 dias atrás", async () => {
    const { org, user } = await makeOrg("Org — Auditoria V4 — Tolerância");
    const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    try {
      await prisma.jobRun.create({
        data: { jobName: "sync-index-values", organizationId: org.id, triggeredBy: "CRON", status: "SUCCESS", finishedAt: new Date() },
      });
      const stale = await prisma.jobRun.create({
        data: { jobName: "recalculate-installments", organizationId: org.id, triggeredBy: "CRON", status: "SUCCESS", startedAt: daysAgo(4), finishedAt: daysAgo(4) },
      });

      const late = await runAuditForOrganization(org.id, { full: false, triggeredBy: "MANUAL" });
      const v4Late = late.checks.find((c) => c.code === "V4_JOB_EXECUTION")!;
      expect(v4Late.status).toBe("ALERT");
      expect(v4Late.summary.missing).toBe(1);

      await prisma.jobRun.update({ where: { id: stale.id }, data: { startedAt: daysAgo(2), finishedAt: daysAgo(2) } });
      const onTime = await runAuditForOrganization(org.id, { full: false, triggeredBy: "MANUAL" });
      expect(onTime.checks.find((c) => c.code === "V4_JOB_EXECUTION")!.status).toBe("OK");
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
  it("grava AuditRun com status ALERT quando qualquer verificação falha, e persiste os 6 AuditCheckResult", async () => {
    const { org, user } = await makeOrg("Org — Auditoria Orquestrador");
    try {
      // Organização "vazia" já basta pro V4 alertar (nenhum JobRun ainda) — suficiente pra provar a propagação do status geral.
      const result = await runAuditForOrganization(org.id, { full: false, triggeredBy: "CRON" });
      expect(result.status).toBe("ALERT");
      expect(result.checks).toHaveLength(6);

      const persisted = await prisma.auditRun.findUnique({
        where: { id: result.auditRunId },
        include: { checks: true },
      });
      expect(persisted?.status).toBe("ALERT");
      expect(persisted?.triggeredBy).toBe("CRON");
      expect(persisted?.checks).toHaveLength(6);
      expect(persisted?.finishedAt).not.toBeNull();
    } finally {
      await cleanupOrg(org.id, user.id);
    }
  });
});
