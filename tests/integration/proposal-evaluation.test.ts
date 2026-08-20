import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/server/auth-context";
import { createSpe } from "@/server/spes";
import { createDevelopment } from "@/server/developments";
import { createUnit } from "@/server/units";
import { createCustomer } from "@/server/customers";
import { createBroker } from "@/server/crm";
import { createSalesTable } from "@/server/sales-tables";
import { createIndexRule, upsertIndexValue } from "@/server/index-rules";
import {
  upsertProposalEvaluationRule,
  getEffectiveProposalEvaluationRule,
  getGeneralProposalEvaluationRule,
  listProposalEvaluationRuleOverrides,
  DEFAULT_PROPOSAL_EVALUATION_RULE,
  DEFAULT_ANALYSIS_APPROVAL_LEVELS,
} from "@/server/proposal-evaluation-rules";
import { createProposal, submitProposalForApproval, decideProposalApproval, getProposal } from "@/server/proposals";
import { convertProposalToSale } from "@/server/sales";
import { createContract, markAwaitingSignature, confirmSignature, getContract } from "@/server/contracts";

/**
 * docs/ESPEC_MODULO_COMERCIAL.md, Parte 4.2 + Parte 5 (Módulo Comercial
 * etapas 4-6): destino da entrada (SPE vs comissão do corretor) e o motor de
 * avaliação automática de propostas por VPL, com os 3 status e o módulo de
 * aprovação configurável por empreendimento. Isolamento entre organizações
 * no padrão de tests/integration/org-scope*.test.ts.
 */

let org: { id: string };
let user: { id: string };
let context: AccessContext;
let developmentId: string;

beforeAll(async () => {
  org = await prisma.organization.create({ data: { name: "Org — Avaliação de Propostas" } });
  user = await prisma.user.create({
    data: { id: crypto.randomUUID(), email: "avaliacao-propostas@teste.local", fullName: "Usuário Avaliação" },
  });
  context = { userId: user.id, organizationId: org.id, roleNames: [], permissions: new Set() };

  const spe = await createSpe(context, {
    name: "SPE Avaliação de Propostas",
    document: "63265390000141",
    status: "ACTIVE",
    email: "spe-avaliacao@teste.local",
    phone: "62999990040",
  });
  const development = await createDevelopment(context, {
    speId: spe.id,
    name: "Empreendimento Avaliação de Propostas",
    type: "RESIDENTIAL_BUILDING",
  });
  developmentId = development.id;
});

afterAll(async () => {
  const orgIds = [org.id];
  await prisma.installmentPayment.deleteMany({ where: { installment: { portfolio: { organizationId: { in: orgIds } } } } });
  await prisma.financialCalculation.deleteMany({ where: { installment: { portfolio: { organizationId: { in: orgIds } } } } });
  await prisma.installment.deleteMany({ where: { portfolio: { organizationId: { in: orgIds } } } });
  await prisma.receivablePortfolio.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.commissionSplit.deleteMany({ where: { sale: { organizationId: { in: orgIds } } } });
  await prisma.contract.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.sale.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.proposalApproval.deleteMany({ where: { proposal: { organizationId: { in: orgIds } } } });
  await prisma.proposal.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.salesTable.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.unit.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.broker.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.proposalEvaluationRule.deleteMany({ where: { development: { organizationId: { in: orgIds } } } });
  await prisma.indexValue.deleteMany({ where: { indexRule: { organizationId: { in: orgIds } } } });
  await prisma.indexRule.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.development.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("Avaliação automática — 3 status", () => {
  it("proposta dentro da tabela (sem contra-proposta) é sempre aprovada automaticamente (desvio 0%)", async () => {
    // Entrada de 20% na tabela padrão -> acima do mínimo de 10% dos defaults
    // da regra de avaliação (senão a entrada 0% do fluxo sem tabela reprovaria).
    const salesTable = await createSalesTable(context, {
      developmentId,
      name: "Tabela Padrão Avaliação 1",
      downPaymentPercent: 20,
      monthlyInstallments: 10,
    });
    const unit = await createUnit(context, {
      developmentId,
      unitType: "APARTMENT",
      number: "A101",
      referenceValue: 500000,
    });
    const customer = await createCustomer(context, {
      type: "INDIVIDUAL",
      name: "Cliente Avaliação 1",
      document: "02654427102",
    });

    const proposal = await createProposal(context, {
      developmentId,
      unitId: unit.id,
      customerId: customer.id,
      salesTableId: salesTable.id,
      discountPercent: 0,
    });

    expect(proposal.evaluationStatus).toBe("APPROVED_AUTO");
    expect(Number(proposal.npvDeviationPercent)).toBe(0);

    const submitted = await submitProposalForApproval(context, proposal.id);
    expect(submitted.status).toBe("APPROVED");

    const approvals = await prisma.proposalApproval.count({ where: { proposalId: proposal.id } });
    expect(approvals).toBe(0); // aprovação automática não passa pelo módulo de alçada

    const unitAfter = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(unitAfter.status).toBe("PROPOSAL_APPROVED");
  });

  it("contra-proposta com deságio de VPL fora da tolerância vai pro módulo de aprovação configurado", async () => {
    await upsertProposalEvaluationRule(context, developmentId, {
      allowOffTable: true,
      discountRatePercent: 1, // 1% a.m. — precisa de taxa > 0 pra alongar prazo mexer no VPL
      discountRatePeriod: "MONTHLY",
      vplTolerancePercent: 3,
      vplAnalysisLimitPercent: 20,
      minDownPaymentPercent: 5,
      maxTermMonths: 120,
      maxPostKeysPercent: 50,
      analysisApprovalLevels: ["SALES_MANAGER", "DIRECTOR"],
    });

    const salesTable = await createSalesTable(context, {
      developmentId,
      name: "Tabela Avaliação",
      downPaymentPercent: 20,
      monthlyInstallments: 10,
    });
    const unit = await createUnit(context, {
      developmentId,
      unitType: "APARTMENT",
      number: "A102",
      referenceValue: 500000,
    });
    const customer = await createCustomer(context, {
      type: "INDIVIDUAL",
      name: "Cliente Avaliação 2",
      document: "11144477735",
    });

    // Contra-proposta: mesma entrada, mas dilui o saldo em 60 parcelas em vez
    // de 10 -> a 1% a.m., o VPL cai ~16.5% (conferido à mão: soma de anuidade
    // 40000@10 vs 6666,67@60 descontada a 1% a.m.) -> entre a tolerância de 3%
    // e o limite de análise de 20%, sem violar nenhum limite duro.
    const proposal = await createProposal(context, {
      developmentId,
      unitId: unit.id,
      customerId: customer.id,
      salesTableId: salesTable.id,
      discountPercent: 0,
      proposedDownPaymentPercent: 20,
      proposedMonthlyInstallments: 60,
    });

    expect(proposal.evaluationStatus).toBe("PENDING_ANALYSIS");

    const submitted = await submitProposalForApproval(context, proposal.id);
    expect(submitted.status).toBe("PENDING_APPROVAL");

    const approvals = await prisma.proposalApproval.findMany({ where: { proposalId: proposal.id } });
    expect(approvals.map((a) => a.level).sort()).toEqual(["DIRECTOR", "SALES_MANAGER"]);

    await decideProposalApproval(context, proposal.id, "SALES_MANAGER", "APPROVED");
    let afterFirst = await getProposal(org.id, proposal.id);
    expect(afterFirst?.status).toBe("PENDING_APPROVAL");

    await decideProposalApproval(context, proposal.id, "DIRECTOR", "APPROVED");
    afterFirst = await getProposal(org.id, proposal.id);
    expect(afterFirst?.status).toBe("APPROVED");

    const unitAfter = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(unitAfter.status).toBe("PROPOSAL_APPROVED");
  });

  it("entrada abaixo do mínimo é reprovada automaticamente, sem passar pelo módulo de aprovação", async () => {
    await upsertProposalEvaluationRule(context, developmentId, {
      allowOffTable: true,
      discountRatePercent: 0,
      discountRatePeriod: "MONTHLY",
      vplTolerancePercent: 3,
      vplAnalysisLimitPercent: 20,
      minDownPaymentPercent: 15,
      maxTermMonths: 120,
      maxPostKeysPercent: 50,
      analysisApprovalLevels: ["SALES_MANAGER"],
    });

    const unit = await createUnit(context, {
      developmentId,
      unitType: "APARTMENT",
      number: "A103",
      referenceValue: 500000,
    });
    const customer = await createCustomer(context, {
      type: "INDIVIDUAL",
      name: "Cliente Avaliação 3",
      document: "96173820340",
    });

    const proposal = await createProposal(context, {
      developmentId,
      unitId: unit.id,
      customerId: customer.id,
      discountPercent: 0,
      proposedDownPaymentPercent: 5, // abaixo do mínimo de 15%
      proposedMonthlyInstallments: 10,
    });

    expect(proposal.evaluationStatus).toBe("REJECTED_AUTO");
    expect(proposal.evaluationReason).toMatch(/entrada/i);

    const submitted = await submitProposalForApproval(context, proposal.id);
    expect(submitted.status).toBe("REJECTED");

    const approvals = await prisma.proposalApproval.count({ where: { proposalId: proposal.id } });
    expect(approvals).toBe(0);

    const unitAfter = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(unitAfter.status).toBe("AVAILABLE");
  });

  it("a correção da fase de obra da tabela entra no VPL — sem ela, dois fluxos diferentes nominalmente empatariam", async () => {
    const indexRule = await createIndexRule(context, { code: "INCC", name: "INCC Avaliação" });
    await upsertIndexValue(context, {
      indexRuleId: indexRule.id,
      referenceMonth: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
      ratePercent: 5, // 5% no primeiro mês da parcela — bem acima de ruído
    });

    const salesTable = await createSalesTable(context, {
      developmentId,
      name: "Tabela Com Índice",
      downPaymentPercent: 0,
      monthlyInstallments: 1,
      preHabiteSeIndexRuleId: indexRule.id,
    });

    await upsertProposalEvaluationRule(context, developmentId, {
      allowOffTable: true,
      discountRatePercent: 0,
      discountRatePeriod: "MONTHLY",
      vplTolerancePercent: 0.01, // qualquer desvio não-trivial já sai da tolerância
      vplAnalysisLimitPercent: 50,
      minDownPaymentPercent: 0,
      maxTermMonths: 120,
      maxPostKeysPercent: 100,
      analysisApprovalLevels: ["SALES_MANAGER"],
    });

    const unit = await createUnit(context, {
      developmentId,
      unitType: "APARTMENT",
      number: "A104",
      referenceValue: 500000,
    });
    const customer = await createCustomer(context, {
      type: "INDIVIDUAL",
      name: "Cliente Avaliação 4",
      document: "50864238006",
    });

    // Fluxo proposto NOMINALMENTE idêntico ao padrão (mesma entrada/parcelas) —
    // se a correção não entrasse no cálculo, o desvio seria 0% e aprovaria
    // sozinho mesmo com tolerância de 0.01%. Como о índice ESTÁ correto e
    // pré-Habite-se é aplicado igualmente aos dois fluxos, ainda deve bater
    // 0% (mesma correção nos dois lados) — a prova real é a outra asserção
    // abaixo, que muda só o prazo do fluxo proposto pra um mês diferente da
    // tabela, sob o MESMO índice, e confirma que os VPLs DIVERGEM por causa
    // da correção projetada em datas diferentes.
    const proposal = await createProposal(context, {
      developmentId,
      unitId: unit.id,
      customerId: customer.id,
      salesTableId: salesTable.id,
      discountPercent: 0,
    });
    expect(proposal.evaluationStatus).toBe("APPROVED_AUTO");
    expect(Number(proposal.npvStandard)).toBe(Number(proposal.npvProposed));

    const proposalWithShiftedTerm = await createProposal(context, {
      developmentId,
      unitId: unit.id,
      customerId: customer.id,
      salesTableId: salesTable.id,
      discountPercent: 0,
      proposedMonthlyInstallments: 3, // empurra a parcela pra mais meses de correção
    });
    expect(Number(proposalWithShiftedTerm.npvProposed)).not.toBe(Number(proposalWithShiftedTerm.npvStandard));
  });
});

describe("Destino da entrada (Parte 4.2)", () => {
  it("SPE_ACCOUNT (padrão): a entrada entra na carteira normalmente", async () => {
    const salesTable = await createSalesTable(context, {
      developmentId,
      name: "Tabela SPE",
      downPaymentPercent: 20,
      monthlyInstallments: 2,
      downPaymentDestination: "SPE_ACCOUNT",
    });
    const unit = await createUnit(context, {
      developmentId,
      unitType: "APARTMENT",
      number: "B101",
      referenceValue: 100000,
    });
    const customer = await createCustomer(context, {
      type: "INDIVIDUAL",
      name: "Cliente Destino SPE",
      document: "72495130847",
    });

    const proposal = await createProposal(context, {
      developmentId,
      unitId: unit.id,
      customerId: customer.id,
      salesTableId: salesTable.id,
      discountPercent: 0,
    });
    await submitProposalForApproval(context, proposal.id);
    const sale = await convertProposalToSale(context, proposal.id);
    const contract = await createContract(context, sale.id);
    await markAwaitingSignature(context, contract.id);
    await confirmSignature(context, contract.id);

    const full = await getContract(org.id, contract.id);
    expect(full?.portfolio?.installments.some((i) => i.label === "Entrada")).toBe(true);
    expect(Number(full?.portfolio?.totalValue)).toBe(100000);
  });

  it("BROKER_COMMISSION: a entrada não entra na carteira e abate da comissão do corretor", async () => {
    const salesTable = await createSalesTable(context, {
      developmentId,
      name: "Tabela Comissão",
      downPaymentPercent: 10, // 10% de 100000 = 10000
      monthlyInstallments: 2,
      commissionPercent: 6, // 6% de 100000 = 6000 (menor que a entrada)
      downPaymentDestination: "BROKER_COMMISSION",
    });
    const unit = await createUnit(context, {
      developmentId,
      unitType: "APARTMENT",
      number: "B102",
      referenceValue: 100000,
    });
    const customer = await createCustomer(context, {
      type: "INDIVIDUAL",
      name: "Cliente Destino Comissão",
      document: "36547891004",
    });
    const broker = await createBroker(context, { name: "Corretor Destino Comissão" });

    const proposal = await createProposal(context, {
      developmentId,
      unitId: unit.id,
      customerId: customer.id,
      salesTableId: salesTable.id,
      brokerId: broker.id,
      discountPercent: 0,
    });
    await submitProposalForApproval(context, proposal.id);
    const sale = await convertProposalToSale(context, proposal.id);

    const splitBefore = await prisma.commissionSplit.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(Number(splitBefore.value)).toBe(6000);

    const contract = await createContract(context, sale.id);
    await markAwaitingSignature(context, contract.id);
    await confirmSignature(context, contract.id);

    const full = await getContract(org.id, contract.id);
    expect(full?.portfolio?.installments.some((i) => i.label === "Entrada")).toBe(false);
    expect(Number(full?.portfolio?.totalValue)).toBe(90000); // 100000 - 10000 de entrada

    const splitAfter = await prisma.commissionSplit.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(Number(splitAfter.value)).toBe(0); // 6000 de comissão - 10000 de entrada, sem sobrar (piso 0)

    const contractAfter = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(Number(contractAfter.downPaymentCommissionExcess)).toBe(4000); // 10000 - 6000 de excedente
  });
});

describe("Isolamento entre organizações", () => {
  it("Org B não cria proposta nem configura regra de avaliação do empreendimento da Org A", async () => {
    const orgB = await prisma.organization.create({ data: { name: "Org B — Avaliação de Propostas" } });
    const userB = await prisma.user.create({
      data: { id: crypto.randomUUID(), email: "org-b-avaliacao@teste.local", fullName: "Usuário Org B" },
    });
    const contextB: AccessContext = { userId: userB.id, organizationId: orgB.id, roleNames: [], permissions: new Set() };

    try {
      await expect(
        upsertProposalEvaluationRule(contextB, developmentId, {
          allowOffTable: true,
          discountRatePercent: 1,
          discountRatePeriod: "MONTHLY",
          vplTolerancePercent: 3,
          vplAnalysisLimitPercent: 10,
          minDownPaymentPercent: 10,
          maxTermMonths: 120,
          maxPostKeysPercent: 30,
          analysisApprovalLevels: ["SALES_MANAGER"],
        }),
      ).rejects.toThrow();

      const unit = await createUnit(context, {
        developmentId,
        unitType: "APARTMENT",
        number: "C101",
        referenceValue: 100000,
      });
      await expect(
        createProposal(contextB, {
          developmentId,
          unitId: unit.id,
          customerId: "00000000-0000-0000-0000-000000000000",
          discountPercent: 0,
        }),
      ).rejects.toThrow("Unidade inválida");
    } finally {
      await prisma.auditEvent.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.user.deleteMany({ where: { id: userB.id } });
      await prisma.organization.deleteMany({ where: { id: orgB.id } });
    }
  });
});

/**
 * docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 1.3 — regra geral (organização)
 * OU por empreendimento, consistente. Regressão da cascata de resolução:
 * empreendimento específico → geral da organização → default do código.
 */
describe("Regra geral × por empreendimento (Parte 1.3)", () => {
  it("sem regra geral nem específica, cai no default do código", async () => {
    const org2 = await prisma.organization.create({ data: { name: "Org — Avaliação Geral 1" } });
    const spe2 = await createSpe({ ...context, organizationId: org2.id }, {
      name: "SPE Avaliação Geral 1", document: "63265390000141", status: "ACTIVE",
      email: "spe-avaliacao-geral-1@teste.local", phone: "62999990300",
    });
    const dev2 = await createDevelopment({ ...context, organizationId: org2.id }, {
      speId: spe2.id, name: "Dev Avaliação Geral 1", type: "RESIDENTIAL_BUILDING",
    });

    const rule = await getEffectiveProposalEvaluationRule(org2.id, dev2.id);
    expect(rule).toEqual({ ...DEFAULT_PROPOSAL_EVALUATION_RULE, analysisApprovalLevels: DEFAULT_ANALYSIS_APPROVAL_LEVELS });

    await prisma.development.deleteMany({ where: { organizationId: org2.id } });
    await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: org2.id } });
    await prisma.organization.delete({ where: { id: org2.id } });
  });

  it("regra geral configurada vale pra empreendimento sem regra própria", async () => {
    const org2 = await prisma.organization.create({ data: { name: "Org — Avaliação Geral 2" } });
    const ctx2 = { ...context, organizationId: org2.id };
    const spe2 = await createSpe(ctx2, {
      name: "SPE Avaliação Geral 2", document: "63265390000141", status: "ACTIVE",
      email: "spe-avaliacao-geral-2@teste.local", phone: "62999990301",
    });
    const dev2 = await createDevelopment(ctx2, { speId: spe2.id, name: "Dev Avaliação Geral 2", type: "RESIDENTIAL_BUILDING" });

    const generalInput = {
      allowOffTable: false,
      discountRatePercent: 2,
      discountRatePeriod: "YEARLY" as const,
      vplTolerancePercent: 5,
      vplAnalysisLimitPercent: 15,
      minDownPaymentPercent: 20,
      maxTermMonths: 100,
      maxPostKeysPercent: 40,
      analysisApprovalLevels: ["DIRECTOR" as const],
    };
    await upsertProposalEvaluationRule(ctx2, null, generalInput);

    const general = await getGeneralProposalEvaluationRule(ctx2);
    expect(general?.developmentId).toBeNull();
    expect(Number(general?.vplTolerancePercent)).toBe(5);

    const effective = await getEffectiveProposalEvaluationRule(org2.id, dev2.id);
    expect(effective).toEqual(generalInput);

    await prisma.proposalEvaluationRule.deleteMany({ where: { organizationId: org2.id } });
    await prisma.development.deleteMany({ where: { organizationId: org2.id } });
    await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: org2.id } });
    await prisma.organization.delete({ where: { id: org2.id } });
  });

  it("regra do empreendimento sobrescreve a geral, e aparece na lista de sobrescrições", async () => {
    const org2 = await prisma.organization.create({ data: { name: "Org — Avaliação Geral 3" } });
    const ctx2 = { ...context, organizationId: org2.id };
    const spe2 = await createSpe(ctx2, {
      name: "SPE Avaliação Geral 3", document: "63265390000141", status: "ACTIVE",
      email: "spe-avaliacao-geral-3@teste.local", phone: "62999990302",
    });
    const dev2 = await createDevelopment(ctx2, { speId: spe2.id, name: "Dev Avaliação Geral 3", type: "RESIDENTIAL_BUILDING" });

    const generalInput = {
      allowOffTable: true,
      discountRatePercent: 1,
      discountRatePeriod: "MONTHLY" as const,
      vplTolerancePercent: 3,
      vplAnalysisLimitPercent: 10,
      minDownPaymentPercent: 10,
      maxTermMonths: 120,
      maxPostKeysPercent: 30,
      analysisApprovalLevels: ["SALES_MANAGER" as const],
    };
    const overrideInput = {
      allowOffTable: false,
      discountRatePercent: 1.5,
      discountRatePeriod: "MONTHLY" as const,
      vplTolerancePercent: 8,
      vplAnalysisLimitPercent: 25,
      minDownPaymentPercent: 25,
      maxTermMonths: 80,
      maxPostKeysPercent: 20,
      analysisApprovalLevels: ["DIRECTOR" as const, "FINANCIAL" as const],
    };
    await upsertProposalEvaluationRule(ctx2, null, generalInput);
    await upsertProposalEvaluationRule(ctx2, dev2.id, overrideInput);

    const effective = await getEffectiveProposalEvaluationRule(org2.id, dev2.id);
    expect(effective).toEqual(overrideInput);

    const overrides = await listProposalEvaluationRuleOverrides(ctx2);
    expect(overrides).toHaveLength(1);
    expect(overrides[0].developmentId).toBe(dev2.id);

    // A geral continua intacta, não foi sobrescrita pela regra do empreendimento.
    const general = await getGeneralProposalEvaluationRule(ctx2);
    expect(Number(general?.vplTolerancePercent)).toBe(3);

    await prisma.proposalEvaluationRule.deleteMany({ where: { organizationId: org2.id } });
    await prisma.development.deleteMany({ where: { organizationId: org2.id } });
    await prisma.specialPurposeEntity.deleteMany({ where: { organizationId: org2.id } });
    await prisma.organization.delete({ where: { id: org2.id } });
  });
});
