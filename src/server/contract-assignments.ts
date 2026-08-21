import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { createAssignmentFeeReceivable } from "@/server/receivables-avulsos";
import type { AccessContext } from "@/server/auth-context";
import { canAccessDevelopment } from "@/server/scope";
import type { Prisma } from "@/generated/prisma/client";

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
    if (!contract || !canAccessDevelopment(context, contract.developmentId)) throw new Error("Contrato inválido.");
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
 * de parcelas/pagamentos já lançados nunca é alterado ou apagado). Quando há
 * taxa de cessão, ela vira um recebível avulso (Fase B, Parte 4.3) cobrado
 * do cessionário — NÃO uma parcela na carteira do imóvel: a taxa não é
 * receita da venda e não deve acumular juros/multa contratuais como se
 * fosse parcela de venda (pendência registrada desde a Fase A etapa 5,
 * fechada aqui).
 */
export async function signAssignment(context: AccessContext, assignmentId: string, signedDocumentPath?: string) {
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.contractAssignment.findFirst({
      where: { id: assignmentId, organizationId: context.organizationId },
      include: { contract: { include: { development: { select: { speId: true } } } } },
    });
    if (!assignment || !canAccessDevelopment(context, assignment.contract.developmentId)) throw new Error("Cessão inválida.");
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

    if (assignment.feeAmount && Number(assignment.feeAmount) > 0) {
      await createAssignmentFeeReceivable(tx, {
        organizationId: context.organizationId,
        developmentId: assignment.contract.developmentId,
        speId: assignment.contract.development.speId,
        customerId: assignment.newCustomerId,
        origin: `Taxa de cessão (${assignment.assignmentNumber})`,
        dueDate: assignment.assignmentDate,
        amount: Number(assignment.feeAmount),
        contractAssignmentId: assignment.id,
        actorUserId: context.userId,
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

export function listAssignments(context: AccessContext, contractId: string) {
  const developmentFilter =
    context.developmentAccess === "ALL" ? {} : { contract: { developmentId: { in: [...context.developmentAccess] } } };
  return prisma.contractAssignment.findMany({
    where: { organizationId: context.organizationId, contractId, ...developmentFilter },
    include: { previousCustomer: true, newCustomer: true },
    orderBy: { sequenceNumber: "asc" },
  });
}

export async function getAssignment(context: AccessContext, assignmentId: string) {
  const assignment = await prisma.contractAssignment.findFirst({
    where: { id: assignmentId, organizationId: context.organizationId },
    include: { contract: true, previousCustomer: true, newCustomer: true },
  });
  if (!assignment || !canAccessDevelopment(context, assignment.contract.developmentId)) return null;
  return assignment;
}
