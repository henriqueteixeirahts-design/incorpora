import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { changeUnitStatusTx } from "@/server/units";
import { simulatePaymentFlow } from "@/lib/payment-flow";
import type { AccessContext } from "@/server/auth-context";
import type { ApprovalDecision, ApprovalLevel } from "@/generated/prisma/client";

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

/**
 * Alçada de aprovação por faixa de desconto (PRD seção 7, exemplo literal):
 * até 2% -> gerente comercial; 2-5% -> diretor; acima de 5% -> sócios.
 * Ajustável conforme o usuário validar as regras reais.
 */
export function requiredApprovalLevels(discountPercent: number): ApprovalLevel[] {
  if (discountPercent > 5) return ["SALES_MANAGER", "DIRECTOR", "PARTNERS"];
  if (discountPercent > 2) return ["SALES_MANAGER", "DIRECTOR"];
  return ["SALES_MANAGER"];
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
};

export async function createProposal(context: AccessContext, input: CreateProposalInput) {
  return prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findFirst({
      where: { id: input.unitId, developmentId: input.developmentId },
    });
    if (!unit) throw new Error("Unidade inválida.");
    if (unit.status !== "AVAILABLE" && unit.status !== "RESERVED") {
      throw new Error("Unidade não está disponível nem reservada.");
    }

    const salesTable = input.salesTableId
      ? await tx.salesTable.findFirst({ where: { id: input.salesTableId } })
      : null;

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

    const paymentFlow = simulatePaymentFlow({
      salePrice,
      downPaymentPercent: salesTable?.downPaymentPercent ? Number(salesTable.downPaymentPercent) : null,
      monthlyInstallments: salesTable?.monthlyInstallments ?? null,
      keysInstallmentPercent: salesTable?.keysInstallmentPercent
        ? Number(salesTable.keysInstallmentPercent)
        : null,
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
        paymentFlow: paymentFlow as unknown as object,
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
      payload: { unitId: input.unitId, salePrice },
    });

    return proposal;
  });
}

export async function submitProposalForApproval(context: AccessContext, proposalId: string) {
  return prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.findFirst({
      where: { id: proposalId, organizationId: context.organizationId },
      include: { unit: true },
    });
    if (!proposal) throw new Error("Proposta inválida.");
    if (proposal.status !== "DRAFT") throw new Error("Proposta já foi enviada para aprovação.");

    const levels = requiredApprovalLevels(Number(proposal.discountPercent));

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
      reason: "Proposta enviada para aprovação",
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
