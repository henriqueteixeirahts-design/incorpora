import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import type { AccessContext } from "@/server/auth-context";
import type { Prisma } from "@/generated/prisma/client";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

async function nextAssignmentSequence(tx: Prisma.TransactionClient, contractId: string) {
  const count = await tx.contractAssignment.count({ where: { contractId } });
  return count + 1;
}

export type CreateAssignmentInput = {
  newCustomerId: string;
  assignmentDate: Date;
  feeAmount?: number;
  notes?: string;
};

/**
 * Cria a cessão em rascunho. O cedente (`previousCustomerId`) é sempre o
 * titular atual do contrato no momento da criação — não é um campo
 * escolhido no formulário. Só é permitida uma cessão em rascunho por vez
 * por contrato, pra não haver ambiguidade sobre qual delas reflete a
 * intenção real ao assinar.
 */
export async function createAssignment(context: AccessContext, contractId: string, input: CreateAssignmentInput) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findFirst({
      where: { id: contractId, organizationId: context.organizationId },
    });
    if (!contract) throw new Error("Contrato inválido.");
    if (contract.status !== "SIGNED") throw new Error("Só é possível ceder direitos de contrato assinado.");

    const newCustomer = await tx.customer.findFirst({
      where: { id: input.newCustomerId, organizationId: context.organizationId },
    });
    if (!newCustomer) throw new Error("Cliente cessionário inválido.");
    if (newCustomer.id === contract.customerId) {
      throw new Error("O cessionário não pode ser o próprio titular atual.");
    }

    const pendingDraft = await tx.contractAssignment.findFirst({
      where: { contractId, status: "DRAFT" },
    });
    if (pendingDraft) throw new Error("Já existe uma cessão em rascunho pra este contrato — assine ou cancele antes de criar outra.");

    const sequenceNumber = await nextAssignmentSequence(tx, contractId);
    const assignmentNumber = `${contract.contractNumber}-CS${String(sequenceNumber).padStart(2, "0")}`;

    const assignment = await tx.contractAssignment.create({
      data: {
        organizationId: context.organizationId,
        contractId,
        sequenceNumber,
        assignmentNumber,
        previousCustomerId: contract.customerId,
        newCustomerId: input.newCustomerId,
        assignmentDate: input.assignmentDate,
        feeAmount: input.feeAmount,
        notes: input.notes,
        createdByUserId: context.userId,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "ContractAssignment",
      entityId: assignment.id,
      afterData: assignment,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: contract.developmentId,
      actorUserId: context.userId,
      eventType: "contract.assignment_drafted",
      entityType: "ContractAssignment",
      entityId: assignment.id,
      payload: { assignmentNumber, previousCustomerId: contract.customerId, newCustomerId: input.newCustomerId },
    });

    return assignment;
  });
}

/**
 * Assina a cessão: transfere a titularidade do contrato (`customerId`) pro
 * cessionário. A carteira em si não é recriada nem recalculada — as
 * mesmas parcelas continuam existindo (o extrato do cedente "se encerra"
 * no sentido de que ele deixa de ser o titular a partir daqui; o histórico
 * de parcelas/pagamentos já lançados nunca é alterado ou apagado). Quando
 * há taxa de cessão, ela vira uma parcela nova na carteira existente —
 * não existe um lançamento financeiro avulso genérico no sistema além de
 * `Installment`.
 */
export async function signAssignment(context: AccessContext, assignmentId: string, signedDocumentPath?: string) {
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.contractAssignment.findFirst({
      where: { id: assignmentId, organizationId: context.organizationId },
      include: { contract: { include: { portfolio: { include: { installments: true } } } } },
    });
    if (!assignment) throw new Error("Cessão inválida.");
    if (assignment.status === "SIGNED") throw new Error("Cessão já assinada.");
    if (assignment.contract.customerId !== assignment.previousCustomerId) {
      throw new Error("O titular do contrato mudou desde a criação desta cessão — cancele e crie uma nova.");
    }

    const signedAt = new Date();

    const updated = await tx.contractAssignment.update({
      where: { id: assignmentId },
      data: { status: "SIGNED", signedAt, signedDocumentPath },
    });

    await tx.contract.update({
      where: { id: assignment.contractId },
      data: { customerId: assignment.newCustomerId },
    });

    const portfolio = assignment.contract.portfolio;
    if (portfolio && assignment.feeAmount && Number(assignment.feeAmount) > 0) {
      const maxSequence = portfolio.installments.reduce((max, i) => Math.max(max, i.sequence), 0);
      await tx.installment.create({
        data: {
          portfolioId: portfolio.id,
          sequence: maxSequence + 1,
          label: `Taxa de cessão (${assignment.assignmentNumber})`,
          dueDate: assignment.assignmentDate,
          originalValue: assignment.feeAmount,
        },
      });
      await tx.receivablePortfolio.update({
        where: { id: portfolio.id },
        data: { totalValue: round2(Number(portfolio.totalValue) + Number(assignment.feeAmount)) },
      });
    }

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Contract",
      entityId: assignment.contractId,
      beforeData: { customerId: assignment.previousCustomerId },
      afterData: { customerId: assignment.newCustomerId },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "ContractAssignment",
      entityId: assignmentId,
      beforeData: { status: "DRAFT" },
      afterData: { status: "SIGNED" },
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: assignment.contract.developmentId,
      actorUserId: context.userId,
      eventType: "contract.assignment_signed",
      entityType: "ContractAssignment",
      entityId: assignmentId,
      payload: {
        assignmentNumber: assignment.assignmentNumber,
        previousCustomerId: assignment.previousCustomerId,
        newCustomerId: assignment.newCustomerId,
        feeAmount: assignment.feeAmount ? Number(assignment.feeAmount) : undefined,
      },
    });

    return updated;
  });
}

export function listAssignments(organizationId: string, contractId: string) {
  return prisma.contractAssignment.findMany({
    where: { organizationId, contractId },
    include: { previousCustomer: true, newCustomer: true },
    orderBy: { sequenceNumber: "asc" },
  });
}

export function getAssignment(organizationId: string, assignmentId: string) {
  return prisma.contractAssignment.findFirst({
    where: { id: assignmentId, organizationId },
    include: { contract: true, previousCustomer: true, newCustomer: true },
  });
}
