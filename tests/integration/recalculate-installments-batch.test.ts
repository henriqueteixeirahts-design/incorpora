import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { runJobForSingleOrganization, runJobForAllOrganizations, recalculateInstallmentsJob } from "@/server/jobs";
import { recalculateAllOpenInstallments, recalculateInstallment } from "@/server/receivables";
import { runAuditForOrganization } from "@/server/audit";

/**
 * Regressão da correção do recalculate-installments (deadline 2026-09-25,
 * docs/STATUS_IMPLANTACAO.md) — idempotência (FinancialCalculation vira
 * upsert por competência), checkpoint de retomada (JobRun.cursor), watchdog
 * de execução travada, e conferência cruzada com o oráculo independente da
 * auditoria (V3_MEMORY_CONSISTENCY).
 *
 * `recalculateAllOpenInstallments` processa TODA parcela em aberto da
 * organização (por design — é assim que roda em produção) — por isso cada
 * teste cria sua PRÓPRIA organização, nunca compartilhada entre casos, pra
 * as contagens serem determinísticas.
 */

let fixtureCounter = 0;
const createdOrgIds: string[] = [];

async function createOrg() {
  const org = await prisma.organization.create({
    data: { name: `Org — Teste Lote Recálculo ${++fixtureCounter}`, isActive: true },
  });
  createdOrgIds.push(org.id);
  return org;
}

async function createContractWithInstallments(
  organizationId: string,
  count: number,
  dueDate = new Date("2020-01-01"),
) {
  const seq = String(++fixtureCounter).padStart(6, "0");
  const spe = await prisma.specialPurposeEntity.create({
    data: { organizationId, name: `SPE Lote ${count}`, document: `SPE-${seq}`, status: "ACTIVE" },
  });
  const development = await prisma.development.create({
    data: { organizationId, speId: spe.id, name: `Empreendimento Lote ${count}`, type: "RESIDENTIAL_BUILDING" },
  });
  const unit = await prisma.unit.create({
    data: { developmentId: development.id, unitType: "APARTMENT", number: `L${seq}`, status: "SOLD" },
  });
  const customer = await prisma.customer.create({
    data: { organizationId, type: "INDIVIDUAL", name: `Cliente Lote ${count}`, document: `CUST-${seq}` },
  });
  const proposal = await prisma.proposal.create({
    data: {
      organizationId,
      developmentId: development.id,
      unitId: unit.id,
      customerId: customer.id,
      listPrice: 500000,
      discountPercent: 0,
      salePrice: 500000,
      status: "CONVERTED",
      paymentFlow: {},
    },
  });
  const sale = await prisma.sale.create({
    data: {
      organizationId,
      developmentId: development.id,
      unitId: unit.id,
      proposalId: proposal.id,
      customerId: customer.id,
      saleNumber: `V-LOTE-${seq}`,
      salePrice: 500000,
    },
  });
  const contract = await prisma.contract.create({
    data: {
      organizationId,
      developmentId: development.id,
      unitId: unit.id,
      saleId: sale.id,
      customerId: customer.id,
      contractNumber: `CT-LOTE-${seq}`,
      // Sempre bem antes de qualquer dueDate usado nos fixtures deste
      // arquivo — "issuedAt" default (now()) faria o mês-base ficar DEPOIS
      // do vencimento em cenários com dueDate no passado, um cenário que
      // não ocorre em dado real (parcela nunca vence antes do contrato
      // existir) e que descala o cálculo de mora (dias vencidos desde um
      // mês-base no futuro em relação ao vencimento).
      issuedAt: new Date("2010-01-01"),
    },
  });
  const portfolio = await prisma.receivablePortfolio.create({
    data: { organizationId, contractId: contract.id, totalValue: 1000 * count },
  });

  await prisma.installment.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      portfolioId: portfolio.id,
      sequence: i + 1,
      label: `Parcela ${i + 1}`,
      dueDate,
      originalValue: 1000,
    })),
  });

  return { spe, development, unit, customer, proposal, sale, contract, portfolio };
}

afterEach(async () => {
  while (createdOrgIds.length > 0) {
    const id = createdOrgIds.pop()!;
    await prisma.jobRun.deleteMany({ where: { organizationId: id } });
    await prisma.organization.delete({ where: { id } }).catch(() => {});
  }
});

describe("Idempotência: rodar o job duas vezes no mesmo mês não duplica histórico", () => {
  it("segunda execução produz o mesmo resultValue e não cria linha nova em financial_calculations", async () => {
    const org = await createOrg();
    const fixture = await createContractWithInstallments(org.id, 3);

    const first = await runJobForSingleOrganization(recalculateInstallmentsJob, org.id, "MANUAL");
    expect(first.success).toBe(true);
    expect(first.summary).toMatchObject({ totalOpen: 3, recalculated: 3 });

    const installments = await prisma.installment.findMany({ where: { portfolioId: fixture.portfolio.id } });
    const valuesAfterFirst = new Map(installments.map((i) => [i.id, i.correctedValue?.toString()]));

    const second = await runJobForSingleOrganization(recalculateInstallmentsJob, org.id, "MANUAL");
    expect(second.success).toBe(true);
    // No-op: já concluído neste mês de competência (mesma execução, mesmo dia).
    expect(second.summary).toMatchObject({ skipped: true });

    const installmentsAfterSecond = await prisma.installment.findMany({ where: { portfolioId: fixture.portfolio.id } });
    for (const installment of installmentsAfterSecond) {
      expect(installment.correctedValue?.toString()).toBe(valuesAfterFirst.get(installment.id));
    }

    for (const installment of installments) {
      const calcRows = await prisma.financialCalculation.count({ where: { installmentId: installment.id } });
      expect(calcRows).toBe(1);
    }
  });

  it("forçar recalculateAllOpenInstallments direto (sem o no-op do job) faz upsert, não duplica", async () => {
    const org = await createOrg();
    const fixture = await createContractWithInstallments(org.id, 2);

    await recalculateAllOpenInstallments(org.id);
    const afterFirst = await prisma.financialCalculation.findMany({
      where: { installment: { portfolioId: fixture.portfolio.id } },
    });
    expect(afterFirst).toHaveLength(2);

    await recalculateAllOpenInstallments(org.id);
    const afterSecond = await prisma.financialCalculation.findMany({
      where: { installment: { portfolioId: fixture.portfolio.id } },
    });
    expect(afterSecond).toHaveLength(2);
    for (const row of afterSecond) {
      const before = afterFirst.find((r) => r.installmentId === row.installmentId);
      expect(row.resultValue.toString()).toBe(before?.resultValue.toString());
    }
  });
});

describe("Checkpoint: execução interrompida retoma sem reprocessar nem duplicar", () => {
  it("resumeAfterId pula as já processadas e completa só o restante", async () => {
    const org = await createOrg();
    const fixture = await createContractWithInstallments(org.id, 4);
    const installments = await prisma.installment.findMany({
      where: { portfolioId: fixture.portfolio.id },
      orderBy: { id: "asc" },
    });

    // Simula uma execução anterior que processou só as 2 primeiras (ordem
    // estável por id) antes de esgotar o orçamento de tempo.
    const firstTwo = installments.slice(0, 2);
    for (const installment of firstTwo) {
      await prisma.$transaction((tx) => recalculateInstallment(tx, installment.id));
    }
    const calcCountBeforeResume = await prisma.financialCalculation.count({
      where: { installment: { portfolioId: fixture.portfolio.id } },
    });
    expect(calcCountBeforeResume).toBe(2);

    const resumed = await recalculateAllOpenInstallments(org.id, firstTwo[1].id);
    expect(resumed.recalculated).toBe(2); // só as 2 restantes
    expect(resumed.cursor).toBeNull(); // terminou tudo

    const calcCountAfterResume = await prisma.financialCalculation.count({
      where: { installment: { portfolioId: fixture.portfolio.id } },
    });
    expect(calcCountAfterResume).toBe(4); // 2 de antes + 2 novas, nenhuma duplicada

    for (const installment of installments) {
      const rows = await prisma.financialCalculation.count({ where: { installmentId: installment.id } });
      expect(rows).toBe(1);
    }
  });
});

describe("Watchdog: JobRun travado (RUNNING além do teto) vira FAILURE na próxima execução de qualquer job", () => {
  it("marca o órfão como FAILURE ao disparar outro job", async () => {
    const org = await createOrg();
    const orphan = await prisma.jobRun.create({
      data: {
        jobName: "recalculate-installments",
        organizationId: org.id,
        triggeredBy: "CRON",
        status: "RUNNING",
        startedAt: new Date(Date.now() - 15 * 60 * 1000), // 15min atrás — além do teto de 10min
      },
    });

    await createContractWithInstallments(org.id, 1, new Date("2021-01-01"));
    await runJobForSingleOrganization(recalculateInstallmentsJob, org.id, "MANUAL");

    const swept = await prisma.jobRun.findUniqueOrThrow({ where: { id: orphan.id } });
    expect(swept.status).toBe("FAILURE");
    expect(swept.finishedAt).not.toBeNull();
    expect(swept.error).toContain("travada");
  });

  it("JobRun RUNNING recente (dentro do teto) não é tocado pelo watchdog", async () => {
    const org = await createOrg();
    const recent = await prisma.jobRun.create({
      data: {
        jobName: "recalculate-installments",
        organizationId: org.id,
        triggeredBy: "CRON",
        status: "RUNNING",
        startedAt: new Date(Date.now() - 2 * 60 * 1000), // 2min atrás — dentro do teto
      },
    });

    await runJobForAllOrganizations(recalculateInstallmentsJob, "CRON");

    const untouched = await prisma.jobRun.findUniqueOrThrow({ where: { id: recent.id } });
    expect(untouched.status).toBe("RUNNING");

    // cleanup manual — este JobRun nunca vai ser finalizado de verdade neste teste
    await prisma.jobRun.delete({ where: { id: recent.id } });
  });
});

describe("Conferência cruzada com o oráculo independente da auditoria (V3)", () => {
  it("depois do recálculo em lote, V3_MEMORY_CONSISTENCY (full) não acusa nenhuma divergência", async () => {
    const org = await createOrg();
    await createContractWithInstallments(org.id, 5, new Date("2022-06-15"));
    await recalculateAllOpenInstallments(org.id);

    const audit = await runAuditForOrganization(org.id, { full: true, triggeredBy: "MANUAL" });
    const v3 = audit.checks.find((c) => c.code === "V3_MEMORY_CONSISTENCY");
    expect(v3?.status).toBe("OK");
  });
});

describe("Volume: 1.500 parcelas sintéticas processam dentro do orçamento de tempo, sem perder nenhuma", () => {
  it(
    "recalculateAllOpenInstallments processa as 1.500 (em uma ou mais chamadas, via cursor) sem duplicar nem pular",
    async () => {
      const org = await createOrg();
      const TOTAL = 1500;
      const fixture = await createContractWithInstallments(org.id, TOTAL, new Date("2023-03-10"));

      let cursor: string | null = null;
      let totalRecalculated = 0;
      let iterations = 0;
      do {
        const result = await recalculateAllOpenInstallments(org.id, cursor);
        totalRecalculated += result.recalculated;
        cursor = result.cursor;
        iterations += 1;
        expect(iterations).toBeLessThan(20); // trava de segurança do próprio teste, não do produto
      } while (cursor !== null);

      expect(totalRecalculated).toBe(TOTAL);

      const calcCount = await prisma.financialCalculation.count({
        where: { installment: { portfolioId: fixture.portfolio.id } },
      });
      expect(calcCount).toBe(TOTAL); // nenhuma duplicada, nenhuma faltando
    },
    120_000,
  );
});
