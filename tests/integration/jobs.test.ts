import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  runJobForAllOrganizations,
  runJobForSingleOrganization,
  recalculateInstallmentsJob,
  syncIndexValuesJob,
  getJobByName,
  type JobDefinition,
} from "@/server/jobs";

/**
 * Contrato de Job + tabela JobRun (docs/ESPEC_CONFIABILIDADE_JOBS_AUDITORIA.md,
 * Parte 1, etapa 1). Cobre o runner (não os dois jobs reais migrados — esses
 * são exercitados no fim do arquivo, sem tocar rede: o job de sincronização
 * de índices só é testado com uma organização sem regra INCC/IPCA/IGP-M
 * ativa, pra não depender da API real do Banco Central estar no ar durante
 * o CI; recalculo de parcelas já é cálculo local, então é testado de
 * verdade contra dado real).
 */

let org: { id: string };
let inactiveOrg: { id: string };

const fakeSuccessJob: JobDefinition = {
  name: "teste-job-sucesso",
  label: "Job de teste — sucesso",
  description: "Job fake só pra testar o runner.",
  idempotent: true,
  runForOrganization: async () => ({ success: true, summary: { ok: true } }),
};

const fakeFailureJob: JobDefinition = {
  name: "teste-job-falha-controlada",
  label: "Job de teste — falha controlada",
  description: "Job fake que retorna success: false sem lançar exceção.",
  idempotent: true,
  runForOrganization: async () => ({ success: false, summary: {}, error: "Falha esperada pelo teste" }),
};

const fakeThrowJob: JobDefinition = {
  name: "teste-job-excecao",
  label: "Job de teste — exceção",
  description: "Job fake que lança exceção, pra testar que o runner captura e grava JobRun de falha mesmo assim.",
  idempotent: true,
  runForOrganization: async () => {
    throw new Error("Estouro proposital do teste");
  },
};

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Teste de Jobs", isActive: true } });
  inactiveOrg = await prisma.organization.create({ data: { name: "Org Inativa — Teste de Jobs", isActive: false } });
});

afterAll(async () => {
  // runJobForAllOrganizations itera TODA organização ativa do banco — em dev
  // local isso inclui a organização real semeada (seed.ts), não só as
  // criadas aqui. Limpa por prefixo de nome do job (todos os jobs fake
  // deste arquivo começam com "teste-job"), não só por organizationId, pra
  // não deixar rastro em nenhuma organização, real ou de teste.
  await prisma.jobRun.deleteMany({ where: { jobName: { startsWith: "teste-job" } } });
  await prisma.jobRun.deleteMany({ where: { organizationId: { in: [org.id, inactiveOrg.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [org.id, inactiveOrg.id] } } });
});

describe("Runner: registra JobRun com o resultado certo", () => {
  it("grava status SUCCESS quando o job retorna success: true", async () => {
    const result = await runJobForSingleOrganization(fakeSuccessJob, org.id, "MANUAL");
    expect(result.success).toBe(true);

    const jobRun = await prisma.jobRun.findFirst({
      where: { jobName: fakeSuccessJob.name, organizationId: org.id },
      orderBy: { startedAt: "desc" },
    });
    expect(jobRun?.status).toBe("SUCCESS");
    expect(jobRun?.triggeredBy).toBe("MANUAL");
    expect(jobRun?.finishedAt).not.toBeNull();
    expect(jobRun?.summary).toEqual({ ok: true });
  });

  it("grava status FAILURE quando o job retorna success: false, sem lançar pro chamador", async () => {
    const result = await runJobForSingleOrganization(fakeFailureJob, org.id, "CRON");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Falha esperada pelo teste");

    const jobRun = await prisma.jobRun.findFirst({
      where: { jobName: fakeFailureJob.name, organizationId: org.id },
      orderBy: { startedAt: "desc" },
    });
    expect(jobRun?.status).toBe("FAILURE");
    expect(jobRun?.error).toBe("Falha esperada pelo teste");
  });

  it("grava status FAILURE quando o job lança exceção, e não propaga a exceção pro chamador", async () => {
    const result = await runJobForSingleOrganization(fakeThrowJob, org.id, "EVENT");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Estouro proposital do teste");

    const jobRun = await prisma.jobRun.findFirst({
      where: { jobName: fakeThrowJob.name, organizationId: org.id },
      orderBy: { startedAt: "desc" },
    });
    expect(jobRun?.status).toBe("FAILURE");
    expect(jobRun?.error).toContain("Estouro proposital do teste");
  });
});

describe("runJobForAllOrganizations: itera só organizações ativas, um JobRun por organização", () => {
  it("não cria JobRun para organização inativa", async () => {
    await runJobForAllOrganizations(fakeSuccessJob, "CRON");

    const activeRun = await prisma.jobRun.findFirst({
      where: { jobName: fakeSuccessJob.name, organizationId: org.id, triggeredBy: "CRON" },
    });
    expect(activeRun).not.toBeNull();

    const inactiveRun = await prisma.jobRun.findFirst({
      where: { jobName: fakeSuccessJob.name, organizationId: inactiveOrg.id },
    });
    expect(inactiveRun).toBeNull();
  });
});

describe("runJobForSingleOrganization: usado pelo botão 'Executar agora'", () => {
  it("registra triggeredBy MANUAL", async () => {
    await runJobForSingleOrganization(fakeSuccessJob, org.id, "MANUAL");
    const jobRun = await prisma.jobRun.findFirst({
      where: { jobName: fakeSuccessJob.name, organizationId: org.id, triggeredBy: "MANUAL" },
      orderBy: { startedAt: "desc" },
    });
    expect(jobRun).not.toBeNull();
  });
});

describe("Catálogo de jobs (getJobByName) — usado pela tela de Jobs", () => {
  it("encontra os dois jobs migrados pelo nome estável", () => {
    expect(getJobByName("recalculate-installments")?.name).toBe(recalculateInstallmentsJob.name);
    expect(getJobByName("sync-index-values")?.name).toBe(syncIndexValuesJob.name);
    expect(getJobByName("job-que-nao-existe")).toBeUndefined();
  });
});

describe("Jobs reais migrados dos crons — exercitados de ponta a ponta", () => {
  it("recalculateInstallmentsJob recalcula parcela real em aberto e registra JobRun de sucesso", async () => {
    const spe = await prisma.specialPurposeEntity.create({
      data: { organizationId: org.id, name: "SPE Teste Job", document: "63265390000141", status: "ACTIVE" },
    });
    const development = await prisma.development.create({
      data: { organizationId: org.id, speId: spe.id, name: "Empreendimento Teste Job", type: "RESIDENTIAL_BUILDING" },
    });
    const unit = await prisma.unit.create({
      data: { developmentId: development.id, unitType: "APARTMENT", number: "101", status: "SOLD" },
    });
    const customer = await prisma.customer.create({
      data: { organizationId: org.id, type: "INDIVIDUAL", name: "Cliente Teste Job", document: "02654427102" },
    });
    const proposal = await prisma.proposal.create({
      data: {
        organizationId: org.id,
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
        organizationId: org.id,
        developmentId: development.id,
        unitId: unit.id,
        proposalId: proposal.id,
        customerId: customer.id,
        salePrice: 500000,
      },
    });
    const contract = await prisma.contract.create({
      data: {
        organizationId: org.id,
        developmentId: development.id,
        unitId: unit.id,
        saleId: sale.id,
        customerId: customer.id,
        contractNumber: "CT-2026-JOB-TESTE",
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
        dueDate: new Date("2020-01-01"), // bem vencida, pra garantir que o recálculo tem algo a fazer
        originalValue: 100000,
      },
    });

    const result = await runJobForSingleOrganization(recalculateInstallmentsJob, org.id, "CRON");
    expect(result.success).toBe(true);
    expect(result.summary).toMatchObject({ totalOpen: 1, recalculated: 1 });

    const recalculated = await prisma.installment.findUniqueOrThrow({ where: { id: installment.id } });
    expect(recalculated.lastCalculatedAt).not.toBeNull();
    expect(recalculated.status).toBe("OVERDUE");

    const jobRun = await prisma.jobRun.findFirst({
      where: { jobName: recalculateInstallmentsJob.name, organizationId: org.id },
      orderBy: { startedAt: "desc" },
    });
    expect(jobRun?.status).toBe("SUCCESS");

    // cleanup
    await prisma.installment.delete({ where: { id: installment.id } });
    await prisma.receivablePortfolio.delete({ where: { id: portfolio.id } });
    await prisma.contract.delete({ where: { id: contract.id } });
    await prisma.sale.delete({ where: { id: sale.id } });
    await prisma.proposal.delete({ where: { id: proposal.id } });
    await prisma.unit.delete({ where: { id: unit.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
    await prisma.development.delete({ where: { id: development.id } });
    await prisma.specialPurposeEntity.delete({ where: { id: spe.id } });
  });

  it("syncIndexValuesJob roda sem erro e registra JobRun de sucesso quando não há índice oficial ativo (sem tocar rede)", async () => {
    // Organização sem nenhuma IndexRule INCC/IPCA/IGP-M — o job real deve
    // simplesmente não ter nada a sincronizar, sem chamar a API do BC.
    const result = await runJobForSingleOrganization(syncIndexValuesJob, org.id, "CRON");
    expect(result.success).toBe(true);
    expect(result.summary).toEqual({ rules: [] });

    const jobRun = await prisma.jobRun.findFirst({
      where: { jobName: syncIndexValuesJob.name, organizationId: org.id },
      orderBy: { startedAt: "desc" },
    });
    expect(jobRun?.status).toBe("SUCCESS");
  });
});
