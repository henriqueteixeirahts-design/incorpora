import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { runAuditForOrganization } from "@/server/audit";
import { recalculateInstallment } from "@/server/receivables";

/**
 * V6a — consistência do histórico (src/server/audit.ts,
 * checkV6HistoryConsistency): a linha mais recente de FinancialCalculation
 * de cada parcela em aberto tem que bater com o valor guardado na parcela.
 *
 * Inclui o teste de mutação da V6a: cada mutação planta uma divergência
 * real entre o valor guardado e a memória de cálculo — exatamente o que
 * aconteceria com um bug no caminho de gravação (valor escrito por fora do
 * motor, linha de memória perdida, upsert que não atualizou a linha do
 * mês) — e a V6 TEM que acusar com o tipo certo de problema. Se alguma
 * mutação passar sem ALERT, este teste falha.
 */

type V6Issue = { installmentId: string; problem: string };

async function makeFixture(tag: string) {
  const org = await prisma.organization.create({ data: { name: `Org — V6 — ${tag}` } });
  const user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@teste.local`, fullName: "Usuário V6" },
  });
  const spe = await prisma.specialPurposeEntity.create({
    data: { organizationId: org.id, name: `SPE ${tag}`, document: "46127017000105", status: "ACTIVE" },
  });
  const development = await prisma.development.create({
    data: { organizationId: org.id, speId: spe.id, name: `Empreendimento ${tag}`, type: "RESIDENTIAL_BUILDING" },
  });
  const unit = await prisma.unit.create({
    data: { developmentId: development.id, unitType: "APARTMENT", number: "101", status: "SOLD" },
  });
  const customer = await prisma.customer.create({
    data: { organizationId: org.id, type: "INDIVIDUAL", name: `Cliente ${tag}`, document: "02654427102" },
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
      saleNumber: `V-V6-${tag}`,
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
      contractNumber: `CT-V6-${tag}`,
      issuedAt: new Date("2010-01-01"),
    },
  });
  const portfolio = await prisma.receivablePortfolio.create({
    data: { organizationId: org.id, contractId: contract.id, totalValue: 1000 },
  });
  // Vencida: multa + mora entram no valor, o que deixa correctedValue (do
  // FinancialCalculation) diferente de resultValue — a confusão de 18/09.
  const installment = await prisma.installment.create({
    data: { portfolioId: portfolio.id, sequence: 1, label: "Parcela", dueDate: new Date("2026-01-10"), originalValue: 1000 },
  });
  await prisma.$transaction((tx) => recalculateInstallment(tx, installment.id, new Date("2026-03-01T12:00:00")));
  return { org, user, installment };
}

async function cleanup(orgId: string, userId: string) {
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
  await prisma.jobRun.deleteMany({ where: { organizationId: orgId } });
  await prisma.auditCheckResult.deleteMany({ where: { auditRun: { organizationId: orgId } } });
  await prisma.auditRun.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.organization.delete({ where: { id: orgId } });
}

async function runV6(orgId: string) {
  const result = await runAuditForOrganization(orgId, { full: false, triggeredBy: "MANUAL" });
  return result.checks.find((c) => c.code === "V6_HISTORY_CONSISTENCY")!;
}

describe("V6a — consistência do histórico (último FinancialCalculation x valor guardado na parcela)", () => {
  it("controle: parcela gravada pelo motor real fica OK — inclusive recalculada de novo no mesmo mês e num mês novo", async () => {
    const { org, user, installment } = await makeFixture("controle");
    try {
      expect((await runV6(org.id)).status).toBe("OK");

      // Mesmo mês de competência: upsert atualiza a mesma linha.
      await prisma.$transaction((tx) => recalculateInstallment(tx, installment.id, new Date("2026-03-15T12:00:00")));
      // Mês novo: linha nova; a V6 tem que olhar a mais recente.
      await prisma.$transaction((tx) => recalculateInstallment(tx, installment.id, new Date("2026-04-02T12:00:00")));
      expect(await prisma.financialCalculation.count({ where: { installmentId: installment.id } })).toBe(2);

      const v6 = await runV6(org.id);
      expect(v6.status).toBe("OK");
      expect(v6.summary).toMatchObject({ checked: 1, divergent: 0 });
    } finally {
      await cleanup(org.id, user.id);
    }
  });

  it("mutação: valor guardado na parcela escrito por fora do motor (+1 centavo) → VALUE_MISMATCH", async () => {
    const { org, user, installment } = await makeFixture("valor");
    try {
      const stored = await prisma.installment.findUniqueOrThrow({ where: { id: installment.id } });
      await prisma.installment.update({ where: { id: installment.id }, data: { correctedValue: Number(stored.correctedValue) + 0.01 } });

      const v6 = await runV6(org.id);
      expect(v6.status).toBe("ALERT");
      expect((v6.issues as V6Issue[]).map((i) => i.problem)).toEqual(["VALUE_MISMATCH"]);
    } finally {
      await cleanup(org.id, user.id);
    }
  });

  it("mutação: parcela grava o correctedValue do cálculo (sem multa/mora) em vez do resultValue → VALUE_MISMATCH", async () => {
    const { org, user, installment } = await makeFixture("grandeza");
    try {
      const latest = await prisma.financialCalculation.findFirstOrThrow({ where: { installmentId: installment.id } });
      expect(Number(latest.correctedValue)).not.toBe(Number(latest.resultValue)); // pré-condição: a parcela está vencida
      await prisma.installment.update({ where: { id: installment.id }, data: { correctedValue: latest.correctedValue } });

      const v6 = await runV6(org.id);
      expect(v6.status).toBe("ALERT");
      expect((v6.issues as V6Issue[]).map((i) => i.problem)).toEqual(["VALUE_MISMATCH"]);
    } finally {
      await cleanup(org.id, user.id);
    }
  });

  it("mutação: memória de cálculo perdida (nenhum FinancialCalculation) → MISSING_CALCULATION", async () => {
    const { org, user, installment } = await makeFixture("sem-memoria");
    try {
      await prisma.financialCalculation.deleteMany({ where: { installmentId: installment.id } });

      const v6 = await runV6(org.id);
      expect(v6.status).toBe("ALERT");
      expect((v6.issues as V6Issue[]).map((i) => i.problem)).toEqual(["MISSING_CALCULATION"]);
    } finally {
      await cleanup(org.id, user.id);
    }
  });

  it("mutação: recálculo atualizou a parcela mas não a linha de memória (data defasada) → DATE_MISMATCH", async () => {
    const { org, user, installment } = await makeFixture("data");
    try {
      await prisma.installment.update({ where: { id: installment.id }, data: { lastCalculatedAt: new Date("2026-03-20T12:00:00") } });

      const v6 = await runV6(org.id);
      expect(v6.status).toBe("ALERT");
      expect((v6.issues as V6Issue[]).map((i) => i.problem)).toEqual(["DATE_MISMATCH"]);
    } finally {
      await cleanup(org.id, user.id);
    }
  });
});
