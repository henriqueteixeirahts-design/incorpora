import "server-only";

import { prisma, type TransactionClient } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { simulatePaymentFlow, type PaymentFlowResult } from "@/lib/payment-flow";
import type { AccessContext } from "@/server/auth-context";
import { canAccessDevelopment } from "@/server/scope";
import type { ContractAmendmentType } from "@/generated/prisma/client";

/**
 * Aditivo contratual (Fase A, Parte 2.2). Criado a partir do contrato
 * vigente (precisa estar SIGNED), numeração sequencial vinculada
 * (`CT-2026-0001-AD01`). Só `FLOW_RENEGOTIATION` reprograma a carteira ao
 * assinar — os demais tipos (alteração de unidade/prazo/outro) ficam
 * registrados e documentados, sem mover unidade ou remontar prazo de
 * verdade (a spec não detalha esse comportamento pra essa etapa).
 */

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

async function nextAmendmentSequence(tx: TransactionClient, contractId: string) {
  const count = await tx.contractAmendment.count({ where: { contractId } });
  return count + 1;
}

export type CreateAmendmentInput = {
  type: ContractAmendmentType;
  notes?: string;
  // Só usado quando type = FLOW_RENEGOTIATION — os mesmos 3 parâmetros da
  // contra-proposta de fluxo (Módulo Comercial, Parte 5.1), aplicados sobre
  // o saldo AINDA NÃO recebido do contrato (não o valor total da venda).
  downPaymentPercent?: number;
  monthlyInstallments?: number;
  keysInstallmentPercent?: number;
};

/**
 * Calcula o saldo ainda não recebido — soma nominal (`originalValue`) das
 * parcelas PENDING/OVERDUE da carteira atual. É esse saldo que a
 * renegociação de fluxo redistribui; parcelas PAID/PARTIALLY_PAID não
 * entram porque já foram (ao menos parcialmente) recebidas e ficam
 * intocadas (spec: "recebidas permanecem intactas").
 */
export async function getRemainingBalance(context: AccessContext, contractId: string) {
  const portfolio = await prisma.receivablePortfolio.findFirst({
    where: { contractId, organizationId: context.organizationId },
    include: { installments: true, contract: { select: { developmentId: true } } },
  });
  if (!portfolio || !canAccessDevelopment(context, portfolio.contract.developmentId)) return 0;
  return round2(
    portfolio.installments
      .filter((i) => i.status === "PENDING" || i.status === "OVERDUE")
      .reduce((sum, i) => sum + Number(i.originalValue), 0),
  );
}

export async function createAmendment(context: AccessContext, contractId: string, input: CreateAmendmentInput) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findFirst({
      where: { id: contractId, organizationId: context.organizationId },
      include: { portfolio: { include: { installments: true } } },
    });
    if (!contract || !canAccessDevelopment(context, contract.developmentId)) throw new Error("Contrato inválido.");
    if (contract.status !== "SIGNED") throw new Error("Só é possível criar aditivo em contrato assinado.");

    let proposedPaymentFlow: PaymentFlowResult | undefined;
    if (input.type === "FLOW_RENEGOTIATION") {
      if (!contract.portfolio) throw new Error("Contrato sem carteira — nada a renegociar.");
      const remainingBalance = round2(
        contract.portfolio.installments
          .filter((i) => i.status === "PENDING" || i.status === "OVERDUE")
          .reduce((sum, i) => sum + Number(i.originalValue), 0),
      );
      if (remainingBalance <= 0) throw new Error("Não há saldo em aberto pra renegociar — carteira já quitada.");

      proposedPaymentFlow = simulatePaymentFlow({
        salePrice: remainingBalance,
        downPaymentPercent: input.downPaymentPercent ?? null,
        monthlyInstallments: input.monthlyInstallments ?? null,
        keysInstallmentPercent: input.keysInstallmentPercent ?? null,
      });
    }

    const sequenceNumber = await nextAmendmentSequence(tx, contractId);
    const amendmentNumber = `${contract.contractNumber}-AD${String(sequenceNumber).padStart(2, "0")}`;

    const amendment = await tx.contractAmendment.create({
      data: {
        organizationId: context.organizationId,
        contractId,
        sequenceNumber,
        amendmentNumber,
        type: input.type,
        notes: input.notes,
        proposedPaymentFlow: proposedPaymentFlow as unknown as object,
        createdByUserId: context.userId,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "ContractAmendment",
      entityId: amendment.id,
      afterData: amendment,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: contract.developmentId,
      actorUserId: context.userId,
      eventType: "contract.amendment_drafted",
      entityType: "ContractAmendment",
      entityId: amendment.id,
      payload: { amendmentNumber, type: input.type },
    });

    return amendment;
  });
}

/**
 * Reprograma a carteira (spec: "parcelas futuras substituídas pelo novo
 * fluxo; recebidas permanecem intactas; memória de cálculo preserva o
 * histórico — nunca apagar parcelas pagas"). PAID/PARTIALLY_PAID nunca são
 * tocadas. PENDING/OVERDUE são CANCELLED (nunca deletadas — o histórico de
 * cálculo/pagamento delas, se algum, continua consultável) e substituídas
 * por parcelas novas, numeradas a partir do maior `sequence` já usado
 * (nunca reaproveita sequence de parcela cancelada). As novas parcelas são
 * datadas a partir da data de assinatura do aditivo — a renegociação
 * descreve o que falta pagar dali pra frente, não o histórico completo.
 */
async function reprogramPortfolio(
  tx: TransactionClient,
  contractId: string,
  proposedPaymentFlow: PaymentFlowResult,
  signedAt: Date,
) {
  const portfolio = await tx.receivablePortfolio.findUniqueOrThrow({
    where: { contractId },
    include: { installments: true },
  });

  const preserved = portfolio.installments.filter((i) => i.status === "PAID" || i.status === "PARTIALLY_PAID");
  const toCancel = portfolio.installments.filter((i) => i.status === "PENDING" || i.status === "OVERDUE");

  for (const installment of toCancel) {
    await tx.installment.update({ where: { id: installment.id }, data: { status: "CANCELLED" } });
  }

  const maxSequence = portfolio.installments.reduce((max, i) => Math.max(max, i.sequence), 0);
  if (proposedPaymentFlow.items.length > 0) {
    await tx.installment.createMany({
      data: proposedPaymentFlow.items.map((item, index) => ({
        portfolioId: portfolio.id,
        sequence: maxSequence + index + 1,
        label: item.label,
        dueDate: addMonths(signedAt, item.dueOffsetMonths),
        originalValue: item.amount,
        isDownPayment: item.isDownPayment ?? false,
      })),
    });
  }

  const newTotalValue = round2(
    preserved.reduce((sum, i) => sum + Number(i.originalValue), 0) +
      proposedPaymentFlow.items.reduce((sum, item) => sum + item.amount, 0),
  );

  await tx.receivablePortfolio.update({ where: { id: portfolio.id }, data: { totalValue: newTotalValue } });

  return { cancelledCount: toCancel.length, createdCount: proposedPaymentFlow.items.length, newTotalValue };
}

export async function signAmendment(context: AccessContext, amendmentId: string, signedDocumentPath?: string) {
  return prisma.$transaction(async (tx) => {
    const amendment = await tx.contractAmendment.findFirst({
      where: { id: amendmentId, organizationId: context.organizationId },
      include: { contract: true },
    });
    if (!amendment || !canAccessDevelopment(context, amendment.contract.developmentId)) throw new Error("Aditivo inválido.");
    if (amendment.status === "SIGNED") throw new Error("Aditivo já assinado.");

    const signedAt = new Date();

    const updated = await tx.contractAmendment.update({
      where: { id: amendmentId },
      data: { status: "SIGNED", signedAt, signedDocumentPath },
    });

    let reprogramResult: Awaited<ReturnType<typeof reprogramPortfolio>> | null = null;
    if (amendment.type === "FLOW_RENEGOTIATION") {
      reprogramResult = await reprogramPortfolio(
        tx,
        amendment.contractId,
        amendment.proposedPaymentFlow as unknown as PaymentFlowResult,
        signedAt,
      );
    }

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "ContractAmendment",
      entityId: amendmentId,
      beforeData: { status: "DRAFT" },
      afterData: { status: "SIGNED" },
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: amendment.contract.developmentId,
      actorUserId: context.userId,
      eventType: "contract.amendment_signed",
      entityType: "ContractAmendment",
      entityId: amendmentId,
      payload: { amendmentNumber: amendment.amendmentNumber, type: amendment.type, reprogram: reprogramResult },
    });

    return updated;
  });
}

export function listAmendments(context: AccessContext, contractId: string) {
  const developmentFilter =
    context.developmentAccess === "ALL" ? {} : { contract: { developmentId: { in: [...context.developmentAccess] } } };
  return prisma.contractAmendment.findMany({
    where: { organizationId: context.organizationId, contractId, ...developmentFilter },
    orderBy: { sequenceNumber: "asc" },
  });
}

export async function getAmendment(context: AccessContext, amendmentId: string) {
  const amendment = await prisma.contractAmendment.findFirst({
    where: { id: amendmentId, organizationId: context.organizationId },
    include: { contract: true },
  });
  if (!amendment || !canAccessDevelopment(context, amendment.contract.developmentId)) return null;
  return amendment;
}
