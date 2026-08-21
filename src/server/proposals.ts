import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { changeUnitStatusTx } from "@/server/units";
import { simulatePaymentFlow, type PaymentFlowResult } from "@/lib/payment-flow";
import { evaluateProposal, type ProposalEvaluationRuleValues } from "@/lib/proposal-evaluation";
import { getEffectiveProposalEvaluationRule } from "@/server/proposal-evaluation-rules";
import { developmentOwnedScope, developmentAccessScope, canAccessDevelopment } from "@/server/scope";
import { ValidationError } from "@/lib/errors";
import type { AccessContext } from "@/server/auth-context";
import type { ApprovalDecision, ApprovalLevel, Prisma } from "@/generated/prisma/client";
import type { CorrectionPhaseConfig } from "@/lib/index-correction";

export function listProposals(context: AccessContext) {
  return prisma.proposal.findMany({
    where: { organizationId: context.organizationId, ...developmentAccessScope(context) },
    include: { unit: true, customer: true, development: true, approvals: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProposal(context: AccessContext, proposalId: string) {
  const proposal = await prisma.proposal.findFirst({
    where: { id: proposalId, organizationId: context.organizationId },
    include: {
      unit: true,
      customer: true,
      development: true,
      salesTable: true,
      broker: true,
      agency: true,
      approvals: true,
      sale: true,
    },
  });
  if (!proposal || !canAccessDevelopment(context, proposal.developmentId)) return null;
  return proposal;
}

/** Fases de correção pra projetar o fluxo NOMINAL da proposta — vêm da tabela de vendas (obra) e do empreendimento (pós-Habite-se), já que ainda não existe Contract nesta etapa. */
function buildProposalCorrectionPhases(
  salesTable: {
    preHabiteSeIndexRule: { values: { referenceMonth: Date; ratePercent: Prisma.Decimal }[] } | null;
    preHabiteSeMonthlyInterestPercent: Prisma.Decimal | null;
    preHabiteSeInterestType: "SIMPLE" | "COMPOUND";
  } | null,
  development: {
    habiteSeDate: Date | null;
    postHabiteSeMonthlyInterestPercent: Prisma.Decimal | null;
    postHabiteSeInterestType: "SIMPLE" | "COMPOUND";
    postHabiteSeIndexRule: { values: { referenceMonth: Date; ratePercent: Prisma.Decimal }[] } | null;
  },
): { habiteSeDate: Date | null; preHabiteSe: CorrectionPhaseConfig; postHabiteSe: CorrectionPhaseConfig | null } {
  const preHabiteSe: CorrectionPhaseConfig = {
    indexValues: (salesTable?.preHabiteSeIndexRule?.values ?? []).map((v) => ({
      referenceMonth: v.referenceMonth,
      ratePercent: Number(v.ratePercent),
    })),
    monthlyInterestPercent: salesTable?.preHabiteSeMonthlyInterestPercent
      ? Number(salesTable.preHabiteSeMonthlyInterestPercent)
      : null,
    interestType: salesTable?.preHabiteSeInterestType ?? "COMPOUND",
  };

  const postHabiteSe: CorrectionPhaseConfig | null = development.postHabiteSeIndexRule
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
    : null;

  return { habiteSeDate: development.habiteSeDate, preHabiteSe, postHabiteSe };
}

export type CreateProposalInput = {
  developmentId: string;
  unitId: string;
  customerId: string;
  salesTableId?: string;
  brokerId?: string;
  agencyId?: string;
  discountPercent: number;
  listPriceOverride?: number;
  notes?: string;
  // Contra-proposta de fluxo (docs/ESPEC_MODULO_COMERCIAL.md, Parte 5.1) —
  // quando informados, substituem os parâmetros da tabela padrão só nesta
  // proposta; omitidos = segue a tabela padrão sem desvio.
  proposedDownPaymentPercent?: number;
  proposedMonthlyInstallments?: number;
  proposedKeysInstallmentPercent?: number;
};

/**
 * Valida os campos de fluxo proposto antes de montar o pagamento — mata o
 * overflow numérico do test drive (B1: usuário digitou 80000 num campo de
 * %) e a combinação impossível de entrada+chaves passando de 100% do valor
 * da venda (B3), barrando com mensagem amigável em vez de deixar o Prisma
 * estourar ou o fluxo silenciosamente inconsistente ser salvo.
 */
function assertValidProposedFlow(input: CreateProposalInput) {
  const assertPercent = (label: string, value: number | undefined) => {
    if (value === undefined) return;
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new ValidationError(`${label} deve estar entre 0% e 100%.`);
    }
  };
  assertPercent("Entrada", input.proposedDownPaymentPercent);
  assertPercent("Chaves", input.proposedKeysInstallmentPercent);

  if (input.proposedMonthlyInstallments !== undefined) {
    if (!Number.isInteger(input.proposedMonthlyInstallments) || input.proposedMonthlyInstallments < 0) {
      throw new ValidationError("Parcelas mensais deve ser um número inteiro não negativo.");
    }
  }

  const downPayment = input.proposedDownPaymentPercent ?? 0;
  const keys = input.proposedKeysInstallmentPercent ?? 0;
  if (input.proposedDownPaymentPercent !== undefined && input.proposedKeysInstallmentPercent !== undefined && downPayment + keys > 100) {
    throw new ValidationError(
      `Entrada (${downPayment}%) + Chaves (${keys}%) não pode ultrapassar 100% do valor da venda.`,
    );
  }
}

async function resolveListPrice(
  tx: typeof prisma | Prisma.TransactionClient,
  input: { unitId: string; listPriceOverride?: number; unitReferenceValue: Prisma.Decimal | null },
  salesTable: { id: string } | null,
): Promise<number> {
  let listPrice = input.listPriceOverride;
  if (!listPrice && salesTable) {
    const entry = await tx.salesTableUnit.findUnique({
      where: { salesTableId_unitId: { salesTableId: salesTable.id, unitId: input.unitId } },
    });
    listPrice = entry ? Number(entry.price) : undefined;
  }
  if (!listPrice) listPrice = input.unitReferenceValue ? Number(input.unitReferenceValue) : undefined;
  if (!listPrice) throw new ValidationError("Sem preço de referência para a unidade — informe o valor de tabela.");
  return listPrice;
}

export async function createProposal(context: AccessContext, input: CreateProposalInput) {
  assertValidProposedFlow(input);

  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findFirst({
      where: { id: input.unitId, developmentId: input.developmentId, ...developmentOwnedScope(context) },
    });
    if (!unit || !canAccessDevelopment(context, input.developmentId)) throw new ValidationError("Unidade inválida.");
    if (unit.status !== "AVAILABLE" && unit.status !== "RESERVED") {
      throw new ValidationError("Unidade não está disponível nem reservada.");
    }

    const salesTable = input.salesTableId
      ? await tx.salesTable.findFirst({
          where: { id: input.salesTableId, ...developmentOwnedScope(context) },
          include: { preHabiteSeIndexRule: { include: { values: true } } },
        })
      : null;

    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, organizationId: context.organizationId },
    });
    if (!customer) throw new ValidationError("Cliente inválido.");
    if (input.brokerId) {
      const broker = await tx.broker.findFirst({ where: { id: input.brokerId, organizationId: context.organizationId } });
      if (!broker) throw new ValidationError("Corretor inválido.");
    }
    if (input.agencyId) {
      const agency = await tx.realEstateAgency.findFirst({
        where: { id: input.agencyId, organizationId: context.organizationId },
      });
      if (!agency) throw new ValidationError("Imobiliária inválida.");
    }

    const listPrice = await resolveListPrice(
      tx,
      { unitId: input.unitId, listPriceOverride: input.listPriceOverride, unitReferenceValue: unit.referenceValue },
      salesTable,
    );

    if (salesTable?.maxDiscountPercent && input.discountPercent > Number(salesTable.maxDiscountPercent)) {
      throw new ValidationError(
        `Desconto acima do máximo autorizado pela tabela (${salesTable.maxDiscountPercent}%).`,
      );
    }

    const salePrice = round2(listPrice * (1 - input.discountPercent / 100));

    const standardFlow = simulatePaymentFlow({
      salePrice,
      downPaymentPercent: salesTable?.downPaymentPercent ? Number(salesTable.downPaymentPercent) : null,
      monthlyInstallments: salesTable?.monthlyInstallments ?? null,
      keysInstallmentPercent: salesTable?.keysInstallmentPercent
        ? Number(salesTable.keysInstallmentPercent)
        : null,
    });

    const hasCustomFlow =
      input.proposedDownPaymentPercent !== undefined ||
      input.proposedMonthlyInstallments !== undefined ||
      input.proposedKeysInstallmentPercent !== undefined;

    const proposedFlow: PaymentFlowResult = hasCustomFlow
      ? simulatePaymentFlow({
          salePrice,
          downPaymentPercent:
            input.proposedDownPaymentPercent ??
            (salesTable?.downPaymentPercent ? Number(salesTable.downPaymentPercent) : null),
          monthlyInstallments: input.proposedMonthlyInstallments ?? salesTable?.monthlyInstallments ?? null,
          keysInstallmentPercent:
            input.proposedKeysInstallmentPercent ??
            (salesTable?.keysInstallmentPercent ? Number(salesTable.keysInstallmentPercent) : null),
        })
      : standardFlow;

    const development = await tx.development.findUniqueOrThrow({
      where: { id: input.developmentId },
      include: { postHabiteSeIndexRule: { include: { values: true } } },
    });
    const phases = buildProposalCorrectionPhases(salesTable, development);
    const rule = await getEffectiveProposalEvaluationRule(context.organizationId, input.developmentId);

    const evaluation = evaluateProposal({
      standardFlow,
      proposedFlow,
      isOffTable: hasCustomFlow,
      baseDate: new Date(),
      habiteSeDate: phases.habiteSeDate,
      preHabiteSe: phases.preHabiteSe,
      postHabiteSe: phases.postHabiteSe,
      salePrice,
      rule,
    });

    const proposal = await tx.proposal.create({
      data: {
        organizationId: context.organizationId,
        developmentId: input.developmentId,
        unitId: input.unitId,
        customerId: input.customerId,
        salesTableId: input.salesTableId,
        brokerId: input.brokerId,
        agencyId: input.agencyId,
        listPrice,
        discountPercent: input.discountPercent,
        salePrice,
        commissionPercent: salesTable?.commissionPercent ?? undefined,
        paymentFlow: standardFlow as unknown as object,
        proposedPaymentFlow: hasCustomFlow ? (proposedFlow as unknown as object) : undefined,
        evaluationStatus: evaluation.status,
        npvStandard: evaluation.npvStandard,
        npvProposed: evaluation.npvProposed,
        npvDeviationPercent: evaluation.deviationPercent,
        evaluationReason: evaluation.reason,
        evaluationChecks: evaluation.checks as unknown as object,
        notes: input.notes,
        createdByUserId: context.userId,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "Proposal",
      entityId: proposal.id,
      afterData: proposal,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: input.developmentId,
      actorUserId: context.userId,
      eventType: "proposal.created",
      entityType: "Proposal",
      entityId: proposal.id,
      payload: { unitId: input.unitId, salePrice, evaluationStatus: evaluation.status },
    });

    return proposal;
  });
}

export type ProposalReferenceData = {
  listPrice: number;
  maxDiscountPercent: number | null;
  commissionPercent: number | null;
  standardFlow: { downPaymentPercent: number; monthlyInstallments: number; keysInstallmentPercent: number };
  rule: ProposalEvaluationRuleValues;
  habiteSeDate: Date | null;
  preHabiteSe: CorrectionPhaseConfig;
  postHabiteSe: CorrectionPhaseConfig | null;
};

/**
 * Dados de referência pro modal de proposta (docs/RELATORIO_TESTDRIVE.md,
 * decisão do PO): preço de tabela, fluxo padrão pré-carregado, regra de
 * avaliação e fases de correção — tudo que o cliente precisa pra rodar a
 * mesma simulação de VPL (funções puras, sem I/O) localmente, em tempo
 * real, sem round-trip ao servidor a cada tecla. `createProposal` recalcula
 * tudo de novo no servidor ao persistir — este endpoint é só leitura/prévia.
 */
export async function getProposalReferenceData(
  context: AccessContext,
  input: { developmentId: string; unitId: string; salesTableId?: string; listPriceOverride?: number },
): Promise<ProposalReferenceData> {
  const unit = await prisma.unit.findFirst({
    where: { id: input.unitId, developmentId: input.developmentId, ...developmentOwnedScope(context) },
  });
  if (!unit || !canAccessDevelopment(context, input.developmentId)) throw new ValidationError("Unidade inválida.");

  const salesTable = input.salesTableId
    ? await prisma.salesTable.findFirst({
        where: { id: input.salesTableId, ...developmentOwnedScope(context) },
        include: { preHabiteSeIndexRule: { include: { values: true } } },
      })
    : null;

  const listPrice = await resolveListPrice(
    prisma,
    { unitId: input.unitId, listPriceOverride: input.listPriceOverride, unitReferenceValue: unit.referenceValue },
    salesTable,
  );

  const development = await prisma.development.findUniqueOrThrow({
    where: { id: input.developmentId },
    include: { postHabiteSeIndexRule: { include: { values: true } } },
  });
  const phases = buildProposalCorrectionPhases(salesTable, development);
  const rule = await getEffectiveProposalEvaluationRule(context.organizationId, input.developmentId);

  return {
    listPrice,
    maxDiscountPercent: salesTable?.maxDiscountPercent ? Number(salesTable.maxDiscountPercent) : null,
    commissionPercent: salesTable?.commissionPercent ? Number(salesTable.commissionPercent) : null,
    standardFlow: {
      downPaymentPercent: salesTable?.downPaymentPercent ? Number(salesTable.downPaymentPercent) : 0,
      monthlyInstallments: salesTable?.monthlyInstallments ?? 0,
      keysInstallmentPercent: salesTable?.keysInstallmentPercent ? Number(salesTable.keysInstallmentPercent) : 0,
    },
    rule,
    habiteSeDate: phases.habiteSeDate,
    preHabiteSe: phases.preHabiteSe,
    postHabiteSe: phases.postHabiteSe,
  };
}

/**
 * Submete a proposta — o motor de avaliação já rodou na criação (a análise
 * numérica acompanha a proposta desde o início, PRD/Parte 5.3); aqui só se
 * decide o que fazer com o resultado já registrado: aprovação automática,
 * reprovação automática, ou entrada no módulo de aprovação (alçada
 * configurável por empreendimento, Parte 5.2 — substitui a faixa fixa por %
 * de desconto que existia antes deste módulo).
 */
export async function submitProposalForApproval(context: AccessContext, proposalId: string) {
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.findFirst({
      where: { id: proposalId, organizationId: context.organizationId },
      include: { unit: true },
    });
    if (!proposal || !canAccessDevelopment(context, proposal.developmentId)) throw new ValidationError("Proposta inválida.");
    if (proposal.status !== "DRAFT") throw new ValidationError("Proposta já foi enviada para aprovação.");

    if (proposal.evaluationStatus === "REJECTED_AUTO") {
      const updated = await tx.proposal.update({ where: { id: proposalId }, data: { status: "REJECTED" } });

      const activeReservation = await tx.reservation.findFirst({
        where: { unitId: proposal.unitId, status: "ACTIVE" },
      });
      await changeUnitStatusTx(tx, {
        organizationId: context.organizationId,
        developmentId: proposal.developmentId,
        unitId: proposal.unitId,
        fromStatus: proposal.unit.status,
        toStatus: activeReservation ? "RESERVED" : "AVAILABLE",
        actorUserId: context.userId,
        reason: `Proposta reprovada automaticamente — ${proposal.evaluationReason}`,
      });

      await recordDevelopmentEvent(tx, {
        organizationId: context.organizationId,
        developmentId: proposal.developmentId,
        actorUserId: context.userId,
        eventType: "proposal.rejected_auto",
        entityType: "Proposal",
        entityId: proposalId,
        payload: { reason: proposal.evaluationReason },
      });

      return updated;
    }

    if (proposal.evaluationStatus === "APPROVED_AUTO") {
      const updated = await tx.proposal.update({ where: { id: proposalId }, data: { status: "APPROVED" } });

      await changeUnitStatusTx(tx, {
        organizationId: context.organizationId,
        developmentId: proposal.developmentId,
        unitId: proposal.unitId,
        fromStatus: proposal.unit.status,
        toStatus: "PROPOSAL_APPROVED",
        actorUserId: context.userId,
        reason: "Aprovada automaticamente pelo motor de avaliação (dentro da tolerância de VPL)",
      });

      await recordDevelopmentEvent(tx, {
        organizationId: context.organizationId,
        developmentId: proposal.developmentId,
        actorUserId: context.userId,
        eventType: "proposal.approved_auto",
        entityType: "Proposal",
        entityId: proposalId,
      });

      return updated;
    }

    // PENDING_ANALYSIS — segue pro módulo de aprovação existente.
    const rule = await getEffectiveProposalEvaluationRule(context.organizationId, proposal.developmentId);
    const levels: ApprovalLevel[] = rule.analysisApprovalLevels;

    for (const level of levels) {
      await tx.proposalApproval.upsert({
        where: { proposalId_level: { proposalId, level } },
        create: { proposalId, level },
        update: {},
      });
    }

    const updated = await tx.proposal.update({
      where: { id: proposalId },
      data: { status: "PENDING_APPROVAL" },
    });

    await changeUnitStatusTx(tx, {
      organizationId: context.organizationId,
      developmentId: proposal.developmentId,
      unitId: proposal.unitId,
      fromStatus: proposal.unit.status,
      toStatus: "PROPOSAL_UNDER_REVIEW",
      actorUserId: context.userId,
      reason: "Proposta enviada para aprovação — fora da tolerância de VPL",
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: proposal.developmentId,
      actorUserId: context.userId,
      eventType: "proposal.submitted",
      entityType: "Proposal",
      entityId: proposalId,
      payload: { levels },
    });

    return updated;
  });
}

export async function decideProposalApproval(
  context: AccessContext,
  proposalId: string,
  level: ApprovalLevel,
  decision: Extract<ApprovalDecision, "APPROVED" | "REJECTED">,
  comment?: string,
) {
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.findFirst({
      where: { id: proposalId, organizationId: context.organizationId },
      include: { unit: true, approvals: true },
    });
    if (!proposal || !canAccessDevelopment(context, proposal.developmentId)) throw new ValidationError("Proposta inválida.");
    if (proposal.status !== "PENDING_APPROVAL") throw new ValidationError("Proposta não está em aprovação.");

    const approval = proposal.approvals.find((item) => item.level === level);
    if (!approval) throw new ValidationError("Etapa de aprovação não aplicável a esta proposta.");
    if (approval.decision !== "PENDING") throw new ValidationError("Etapa já decidida.");

    await tx.proposalApproval.update({
      where: { id: approval.id },
      data: { decision, approverUserId: context.userId, decidedAt: new Date(), comment },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: decision === "APPROVED" ? "approve" : "reject",
      entityType: "ProposalApproval",
      entityId: approval.id,
      afterData: { level, decision, comment },
    });

    if (decision === "REJECTED") {
      const activeReservation = await tx.reservation.findFirst({
        where: { unitId: proposal.unitId, status: "ACTIVE" },
      });

      await tx.proposal.update({ where: { id: proposalId }, data: { status: "REJECTED" } });

      await changeUnitStatusTx(tx, {
        organizationId: context.organizationId,
        developmentId: proposal.developmentId,
        unitId: proposal.unitId,
        fromStatus: proposal.unit.status,
        toStatus: activeReservation ? "RESERVED" : "AVAILABLE",
        actorUserId: context.userId,
        reason: `Proposta reprovada em ${level}`,
      });

      await recordDevelopmentEvent(tx, {
        organizationId: context.organizationId,
        developmentId: proposal.developmentId,
        actorUserId: context.userId,
        eventType: "proposal.rejected",
        entityType: "Proposal",
        entityId: proposalId,
        payload: { level, comment },
      });

      return tx.proposal.findUniqueOrThrow({ where: { id: proposalId } });
    }

    const remainingPending = proposal.approvals.some(
      (item) => item.level !== level && item.decision === "PENDING",
    );

    if (!remainingPending) {
      const updated = await tx.proposal.update({
        where: { id: proposalId },
        data: { status: "APPROVED" },
      });

      await changeUnitStatusTx(tx, {
        organizationId: context.organizationId,
        developmentId: proposal.developmentId,
        unitId: proposal.unitId,
        fromStatus: proposal.unit.status,
        toStatus: "PROPOSAL_APPROVED",
        actorUserId: context.userId,
        reason: "Todas as alçadas aprovaram",
      });

      await recordDevelopmentEvent(tx, {
        organizationId: context.organizationId,
        developmentId: proposal.developmentId,
        actorUserId: context.userId,
        eventType: "proposal.approved",
        entityType: "Proposal",
        entityId: proposalId,
      });

      return updated;
    }

    return tx.proposal.findUniqueOrThrow({ where: { id: proposalId } });
  });
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
