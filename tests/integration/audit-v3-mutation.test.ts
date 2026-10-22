import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { runAuditForOrganization } from "@/server/audit";
import { recalculateInstallment } from "@/server/receivables";

/**
 * Teste de mutação PERMANENTE do oráculo da V3 (auditoria de atualização,
 * src/server/audit.ts). Prova que a V3 não é um verificador morto: com o
 * motor de produção (src/lib/index-correction.ts) deliberadamente errado em
 * multa, mora ou contagem de dias de atraso, a V3 — rodando de verdade
 * contra o banco, pelo caminho real `recalculateInstallment` → valor
 * gravado → `runAuditForOrganization` — TEM que acusar. Se alguma mutação
 * passar sem ALERT, o oráculo deixou de ser independente (ou de conferir
 * essa parte do cálculo) e este teste falha.
 *
 * A mutação entra por `vi.mock` só no motor; o oráculo
 * (src/lib/audit-correction-recompute.ts) não importa nada dele, então
 * continua calculando certo — é exatamente a divergência que se quer ver.
 */

type Mutation = "none" | "fine" | "mora" | "days";
const state = vi.hoisted(() => ({ mutation: "none" as Mutation }));

vi.mock("@/lib/index-correction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/index-correction")>();
  return {
    ...actual,
    calculateInstallment: (input: Parameters<typeof actual.calculateInstallment>[0]) => {
      switch (state.mutation) {
        case "fine": // multa do contrato 2% vira 3%
          return actual.calculateInstallment({ ...input, latePaymentFinePercent: (input.latePaymentFinePercent ?? 0) + 1 });
        case "mora": // mora do contrato 1%/mês vira 1,5%/mês
          return actual.calculateInstallment({
            ...input,
            latePaymentMonthlyInterestPercent: (input.latePaymentMonthlyInterestPercent ?? 0) * 1.5,
          });
        case "days": // conta 1 dia de atraso a mais (o asOfDate gravado continua o real)
          return actual.calculateInstallment({ ...input, asOfDate: new Date(input.asOfDate.getTime() + 24 * 60 * 60 * 1000) });
        default:
          return actual.calculateInstallment(input);
      }
    },
  };
});

afterEach(() => {
  state.mutation = "none";
});

async function makeOverdueInstallment(tag: string) {
  const org = await prisma.organization.create({ data: { name: `Org — Mutação V3 — ${tag}` } });
  const user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@teste.local`, fullName: "Usuário Mutação V3" },
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
      saleNumber: `V-MUT-${tag}`,
      salePrice: 1000,
    },
  });
  // Multa/mora no default do schema (2% e 1%/mês) — os valores que as mutações alteram.
  const contract = await prisma.contract.create({
    data: {
      organizationId: org.id,
      developmentId: development.id,
      unitId: unit.id,
      saleId: sale.id,
      customerId: customer.id,
      contractNumber: `CT-MUT-${tag}`,
      issuedAt: new Date("2010-01-01"),
    },
  });
  const portfolio = await prisma.receivablePortfolio.create({
    data: { organizationId: org.id, contractId: contract.id, totalValue: 1000 },
  });
  const installment = await prisma.installment.create({
    data: { portfolioId: portfolio.id, sequence: 1, label: "Parcela vencida", dueDate: new Date("2026-01-10"), originalValue: 1000 },
  });
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

/** Grava o valor com o motor (mutado ou não) e roda a auditoria SEMANAL — a vencida tem que entrar na amostra. */
async function v3AfterRecalc(mutation: Mutation) {
  const { org, user, installment } = await makeOverdueInstallment(mutation);
  try {
    state.mutation = mutation;
    await prisma.$transaction((tx) => recalculateInstallment(tx, installment.id, new Date("2026-03-01T12:00:00")));
    state.mutation = "none";

    const result = await runAuditForOrganization(org.id, { full: false, triggeredBy: "MANUAL" });
    const v3 = result.checks.find((c) => c.code === "V3_MEMORY_CONSISTENCY")!;
    // Evidência legível quando rodado à mão (scripts/staging-bootstrap.js --mutation-test).
    if (process.env.V3_MUTATION_VERBOSE) {
      console.info(`[V3 mutação=${mutation}] status=${v3.status} summary=${JSON.stringify(v3.summary)} issues=${JSON.stringify(v3.issues)}`);
    }
    return { v3, installmentId: installment.id };
  } finally {
    await cleanup(org.id, user.id);
  }
}

describe("V3 — teste de mutação permanente do motor (multa, mora, dias de atraso)", () => {
  it("sem mutação, o motor e o oráculo concordam (controle — o ALERT abaixo vem da mutação, não do cenário)", async () => {
    const { v3 } = await v3AfterRecalc("none");
    expect(v3.status).toBe("OK");
    expect(v3.summary).toMatchObject({ overdueChecked: 1, divergent: 0 });
  });

  it.each([
    { mutation: "fine", description: "multa 3% em vez de 2%" },
    { mutation: "mora", description: "mora 1,5%/mês em vez de 1%/mês" },
    { mutation: "days", description: "1 dia de atraso a mais" },
  ] as const)("mutação $mutation ($description) — a V3 acusa a parcela", async ({ mutation }) => {
    const { v3, installmentId } = await v3AfterRecalc(mutation);
    expect(v3.status).toBe("ALERT");
    const issues = v3.issues as Array<{ installmentId: string; diff: number }>;
    expect(issues).toHaveLength(1);
    expect(issues[0].installmentId).toBe(installmentId);
    expect(issues[0].diff).toBeGreaterThanOrEqual(0.01);
  });
});
