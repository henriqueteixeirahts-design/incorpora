import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { changeUnitStatusTx } from "@/server/units";
import { simulatePaymentFlow, type PaymentFlowResult } from "@/lib/payment-flow";
import { evaluateProposal } from "@/lib/proposal-evaluation";
import { getEffectiveProposalEvaluationRule } from "@/server/proposal-evaluation-rules";
import { developmentOwnedScope } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";
import type { ApprovalDecision, ApprovalLevel, Prisma } from "@/generated/prisma/client";
import type { CorrectionPhaseConfig } from "@/lib/index-correction";

export function listProposals(organizationId: string) {
  return prisma.proposal.findMany({
    where: { organizationId },
    include: { unit: true, customer: true, development: true, approvals: true },
    orderBy: { createdAt: "desc" },
  });
}

export function getProposal(organizationId: string, proposalId: string) {
  return prisma.proposal.findFirst({
    where: { id: proposalId, organizationId },
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

export async function createProposal(context: AccessContext, input: CreateProposalInput) {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findFirst({
      where: { id: input.unitId, developmentId: input.developmentId, ...developmentOwnedScope(context) },
    });
    if (!unit) throw new Error("Unidade inválida.");
    if (unit.status !== "AVAILABLE" && unit.status !== "RESERVED") {
      throw new Error("Unidade não está disponível nem reservada.");
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
    if (!customer) throw new Error("Cliente inválido.");
    if (input.brokerId) {
      const broker = await tx.broker.findFirst({ where: { id: input.brokerId, organizationId: context.organizationId } });
      if (!broker) throw new Error("Corretor inválido.");
    }
    if (input.agencyId) {
      const agency = await tx.realEstateAgency.findFirst({
        where: { id: input.agencyId, organizationId: context.organizationId },
      });
      if (!agency) throw new Error("Imobiliária inválida.");
    }

    let listPrice = input.listPriceOverride;
    if (!listPrice && salesTable) {
      const entry = await tx.salesTableUnit.findUnique({
        where: { salesTableId_unitId: { salesTableId: salesTable.id, unitId: input.unitId } },
      });
      listPrice = entry ? Number(entry.price) : undefined;
    }
    if (!listPrice) listPrice = unit.referenceValue ? Number(unit.referenceValue) : undefined;
    if (!listPrice) throw new Error("Sem preço de referência para a unidade — informe o valor de tabela.");

    if (salesTable?.maxDiscountPercent && input.discountPercent > Number(salesTable.maxDiscountPercent)) {
      throw new Error(
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
    const rule = await getEffectiveProposalEvaluationRule(input.developmentId);

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
    if (!proposal) throw new Error("Proposta inválida.");
    if (proposal.status !== "DRAFT") throw new Error("Proposta já foi enviada para aprovação.");

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
    const rule = await getEffectiveProposalEvaluationRule(proposal.developmentId);
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
    if (!proposal) throw new Error("Proposta inválida.");
    if (proposal.status !== "PENDING_APPROVAL") throw new Error("Proposta não está em aprovação.");

    const approval = proposal.approvals.find((item) => item.level === level);
    if (!approval) throw new Error("Etapa de aprovação não aplicável a esta proposta.");
    if (approval.decision !== "PENDING") throw new Error("Etapa já decidida.");

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
