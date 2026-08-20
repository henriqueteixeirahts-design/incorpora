import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { simulatePaymentFlow, type PaymentFlowResult } from "@/lib/payment-flow";
import { calculateRenegotiationSettlement, round2 } from "@/lib/renegotiation-settlement";
import { getInstallmentLivePosition } from "@/server/receivables";
import { getEffectiveRenegotiationRule } from "@/server/renegotiation-rules";
import type { AccessContext } from "@/server/auth-context";
import type { ApprovalDecision, ApprovalLevel, Prisma } from "@/generated/prisma/client";

/**
 * Acordo de renegociação de parcelas (Fase B, Parte 2). Diferente do
 * aditivo de renegociação de fluxo (Fase A, `ContractAmendment` tipo
 * FLOW_RENEGOTIATION, que redesenha o fluxo FUTURO inteiro do contrato):
 * aqui o acordo consolida um subconjunto de parcelas já existentes
 * (PENDING/OVERDUE — vencidas e/ou a vencer, nunca PARTIALLY_PAID, pra não
 * ter que decidir o que fazer com um recebimento parcial já lançado numa
 * parcela que vai ser cancelada) com desconto sobre encargos e um novo
 * parcelamento pro saldo consolidado.
 */

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

async function nextAgreementSequence(tx: Prisma.TransactionClient, contractId: string) {
  const count = await tx.renegotiationAgreement.count({ where: { contractId } });
  return count + 1;
}

export type CreateRenegotiationInput = {
  installmentIds: string[];
  agreementDate: Date;
  chargesDiscountPercent: number;
  downPayment?: number;
  monthlyInstallments: number;
  applyFutureCorrection: boolean;
  reason?: string;
};

export async function createRenegotiationAgreement(context: AccessContext, contractId: string, input: CreateRenegotiationInput) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findFirst({
      where: { id: contractId, organizationId: context.organizationId },
      include: {
        indexRule: { include: { values: true } },
        development: { include: { postHabiteSeIndexRule: { include: { values: true } } } },
        portfolio: { include: { installments: true } },
      },
    });
    if (!contract) throw new Error("Contrato inválido.");
    if (contract.status !== "SIGNED") throw new Error("Só é possível renegociar contrato assinado.");
    if (!contract.portfolio) throw new Error("Contrato sem carteira — nada a renegociar.");

    if (input.installmentIds.length === 0) throw new Error("Selecione ao menos uma parcela.");

    const selected = contract.portfolio.installments.filter((i) => input.installmentIds.includes(i.id));
    if (selected.length !== input.installmentIds.length) throw new Error("Parcela inválida.");
    if (selected.some((i) => i.status !== "PENDING" && i.status !== "OVERDUE")) {
      throw new Error("Só é possível renegociar parcelas em aberto (pendentes ou vencidas) — sem pagamento parcial já lançado.");
    }
    if (input.monthlyInstallments < 1) throw new Error("Informe ao menos 1 parcela no novo parcelamento.");
    if (input.chargesDiscountPercent < 0 || input.chargesDiscountPercent > 100) {
      throw new Error("Desconto sobre encargos inválido (0 a 100%).");
    }

    const rule = await getEffectiveRenegotiationRule(context.organizationId, contract.developmentId);
    if (input.monthlyInstallments > rule.maxTermMonths) {
      throw new Error(`Prazo do reparcelamento acima do máximo permitido pra este empreendimento (${rule.maxTermMonths} meses).`);
    }

    let consolidatedPrincipal = 0;
    let consolidatedCharges = 0;
    for (const installment of selected) {
      const position = getInstallmentLivePosition(
        {
          status: installment.status,
          originalValue: Number(installment.originalValue),
          correctedValue: installment.correctedValue ? Number(installment.correctedValue) : null,
          lastCalculatedAt: installment.lastCalculatedAt,
          dueDate: installment.dueDate,
        },
        contract,
        contract.development,
        input.agreementDate,
      );
      consolidatedPrincipal += position.correctedValue;
      consolidatedCharges += position.fineAmount + position.overdueInterestAmount;
    }

    const settlement = calculateRenegotiationSettlement({
      consolidatedPrincipal: round2(consolidatedPrincipal),
      consolidatedCharges: round2(consolidatedCharges),
      chargesDiscountPercent: input.chargesDiscountPercent,
    });

    const needsApproval = input.chargesDiscountPercent > rule.maxDiscountOnChargesPercent;

    const remaining = round2(settlement.finalValue - (input.downPayment ?? 0));
    if (remaining < 0) throw new Error("A entrada do acordo não pode ser maior que o valor final.");
    const proposedPaymentFlow: PaymentFlowResult = simulatePaymentFlow({
      salePrice: settlement.finalValue,
      downPaymentPercent: input.downPayment ? round2((input.downPayment / settlement.finalValue) * 100) : null,
      monthlyInstallments: input.monthlyInstallments,
      keysInstallmentPercent: null,
    });

    const sequenceNumber = await nextAgreementSequence(tx, contractId);
    const agreementNumber = `${contract.contractNumber}-RN${String(sequenceNumber).padStart(2, "0")}`;

    const agreement = await tx.renegotiationAgreement.create({
      data: {
        organizationId: context.organizationId,
        contractId,
        sequenceNumber,
        agreementNumber,
        status: needsApproval ? "PENDING_APPROVAL" : "DRAFT",
        agreementDate: input.agreementDate,
        consolidatedPrincipal: settlement.consolidatedPrincipal,
        consolidatedCharges: settlement.consolidatedCharges,
        chargesDiscountPercent: settlement.chargesDiscountPercent,
        chargesDiscountAmount: settlement.chargesDiscountAmount,
        downPayment: input.downPayment,
        finalValue: settlement.finalValue,
        applyFutureCorrection: input.applyFutureCorrection,
        proposedPaymentFlow: proposedPaymentFlow as unknown as object,
        reason: input.reason,
        createdByUserId: context.userId,
        originInstallments: { connect: selected.map((i) => ({ id: i.id })) },
      },
    });

    if (needsApproval) {
      await tx.renegotiationApproval.createMany({
        data: rule.approvalLevels.map((level) => ({ agreementId: agreement.id, level })),
      });
    }

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "RenegotiationAgreement",
      entityId: agreement.id,
      afterData: agreement,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: contract.developmentId,
      actorUserId: context.userId,
      eventType: "contract.renegotiation_drafted",
      entityType: "RenegotiationAgreement",
      entityId: agreement.id,
      payload: { agreementNumber, finalValue: settlement.finalValue, needsApproval },
    });

    return agreement;
  });
}

export async function decideRenegotiationApproval(
  context: AccessContext,
  agreementId: string,
  level: ApprovalLevel,
  decision: Extract<ApprovalDecision, "APPROVED" | "REJECTED">,
  comment?: string,
) {
  return prisma.$transaction(async (tx) => {
    const agreement = await tx.renegotiationAgreement.findFirst({
      where: { id: agreementId, organizationId: context.organizationId },
      include: { approvals: true, contract: true },
    });
    if (!agreement) throw new Error("Acordo inválido.");
    if (agreement.status !== "PENDING_APPROVAL") throw new Error("Acordo não está em aprovação.");

    const approval = agreement.approvals.find((a) => a.level === level);
    if (!approval) throw new Error("Etapa de aprovação não aplicável a este acordo.");
    if (approval.decision !== "PENDING") throw new Error("Etapa já decidida.");

    await tx.renegotiationApproval.update({
      where: { id: approval.id },
      data: { decision, approverUserId: context.userId, decidedAt: new Date(), comment },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: decision === "APPROVED" ? "approve" : "reject",
      entityType: "RenegotiationApproval",
      entityId: approval.id,
      afterData: { level, decision, comment },
    });

    if (decision === "REJECTED") {
      const updated = await tx.renegotiationAgreement.update({ where: { id: agreementId }, data: { status: "REJECTED" } });
      await recordDevelopmentEvent(tx, {
        organizationId: context.organizationId,
        developmentId: agreement.contract.developmentId,
        actorUserId: context.userId,
        eventType: "contract.renegotiation_rejected",
        entityType: "RenegotiationAgreement",
        entityId: agreementId,
        payload: { level, comment },
      });
      return updated;
    }

    const stillPending = agreement.approvals.some((a) => a.level !== level && a.decision === "PENDING");
    if (!stillPending) {
      return tx.renegotiationAgreement.update({ where: { id: agreementId }, data: { status: "DRAFT" } });
    }

    return tx.renegotiationAgreement.findUniqueOrThrow({ where: { id: agreementId } });
  });
}

export async function signRenegotiationAgreement(context: AccessContext, agreementId: string, signedDocumentPath?: string) {
  return prisma.$transaction(async (tx) => {
    const agreement = await tx.renegotiationAgreement.findFirst({
      where: { id: agreementId, organizationId: context.organizationId },
      include: { contract: { include: { portfolio: true } }, originInstallments: true },
    });
    if (!agreement) throw new Error("Acordo inválido.");
    if (agreement.status !== "DRAFT") {
      throw new Error(
        agreement.status === "PENDING_APPROVAL"
          ? "Acordo ainda aguardando aprovação."
          : agreement.status === "SIGNED"
            ? "Acordo já assinado."
            : "Acordo não pode mais ser assinado (rejeitado ou quebrado).",
      );
    }
    if (!agreement.contract.portfolio) throw new Error("Carteira inválida.");
    if (agreement.originInstallments.some((i) => i.status !== "PENDING" && i.status !== "OVERDUE")) {
      throw new Error("Uma das parcelas de origem mudou de status desde a criação do acordo — crie um novo acordo.");
    }

    const portfolio = agreement.contract.portfolio;
    const allInstallments = await tx.installment.findMany({ where: { portfolioId: portfolio.id } });
    const maxSequence = allInstallments.reduce((max, i) => Math.max(max, i.sequence), 0);

    for (const installment of agreement.originInstallments) {
      await tx.installment.update({
        where: { id: installment.id },
        data: { status: "CANCELLED", originAgreementId: agreement.id },
      });
    }

    const flow = agreement.proposedPaymentFlow as unknown as PaymentFlowResult;
    if (flow.items.length > 0) {
      await tx.installment.createMany({
        data: flow.items.map((item, index) => ({
          portfolioId: portfolio.id,
          sequence: maxSequence + index + 1,
          label: item.label,
          dueDate: addMonths(agreement.agreementDate, item.dueOffsetMonths),
          originalValue: item.amount,
          isDownPayment: item.isDownPayment ?? false,
          destinationAgreementId: agreement.id,
          correctionExempt: !agreement.applyFutureCorrection,
        })),
      });
    }

    const originalValueRemoved = agreement.originInstallments.reduce((sum, i) => sum + Number(i.originalValue), 0);
    const newTotalValue = round2(Number(portfolio.totalValue) - originalValueRemoved + Number(agreement.finalValue));
    await tx.receivablePortfolio.update({ where: { id: portfolio.id }, data: { totalValue: newTotalValue } });

    const signedAt = new Date();
    const updated = await tx.renegotiationAgreement.update({
      where: { id: agreementId },
      data: { status: "SIGNED", signedAt, signedDocumentPath },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "RenegotiationAgreement",
      entityId: agreementId,
      beforeData: { status: "DRAFT" },
      afterData: { status: "SIGNED" },
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: agreement.contract.developmentId,
      actorUserId: context.userId,
      eventType: "contract.renegotiation_signed",
      entityType: "RenegotiationAgreement",
      entityId: agreementId,
      payload: { agreementNumber: agreement.agreementNumber, finalValue: Number(agreement.finalValue), newTotalValue },
    });

    return updated;
  });
}

/**
 * "Acordo quebrado" (Fase B, Parte 2.2, passo 6) — detecção preguiçosa
 * (sem cron: os 2 slots do plano Hobby da Vercel já estão ocupados, mesmo
 * padrão de `listOverdueInstallments`). Chamado ao carregar o extrato do
 * cliente: para cada acordo SIGNED desse cliente, se alguma parcela de
 * destino está PENDING e vencida há mais que `brokenDealGraceDays`
 * (configurável por empreendimento), marca BROKEN. Se a regra manda
 * reativar as condições originais, as parcelas de origem (canceladas ao
 * assinar) voltam ao estado que teriam sem o acordo, e as parcelas de
 * destino ainda não pagas são canceladas — nunca apagadas, mesmo padrão
 * de "nunca apagar" das outras etapas.
 */
export async function checkAndUpdateBrokenAgreementsForCustomer(organizationId: string, customerId: string) {
  const agreements = await prisma.renegotiationAgreement.findMany({
    where: { organizationId, status: "SIGNED", contract: { customerId } },
    include: {
      contract: true,
      destinationInstallments: true,
      originInstallments: true,
    },
  });

  const now = new Date();
  let brokenCount = 0;

  for (const agreement of agreements) {
    const rule = await getEffectiveRenegotiationRule(organizationId, agreement.contract.developmentId);
    const graceMs = rule.brokenDealGraceDays * 24 * 60 * 60 * 1000;

    const brokenInstallment = agreement.destinationInstallments.find(
      (i) => i.status === "PENDING" && now.getTime() - i.dueDate.getTime() > graceMs,
    );
    if (!brokenInstallment) continue;

    await prisma.$transaction(async (tx) => {
      await tx.renegotiationAgreement.update({
        where: { id: agreement.id },
        data: { status: "BROKEN", brokenAt: now, reactivatedOriginal: rule.reactivateOriginalOnBreak },
      });

      if (rule.reactivateOriginalOnBreak) {
        for (const origin of agreement.originInstallments) {
          await tx.installment.update({
            where: { id: origin.id },
            data: { status: origin.dueDate < now ? "OVERDUE" : "PENDING" },
          });
        }
        for (const destination of agreement.destinationInstallments) {
          if (destination.status === "PENDING" || destination.status === "OVERDUE") {
            await tx.installment.update({ where: { id: destination.id }, data: { status: "CANCELLED" } });
          }
        }
      }

      await recordDevelopmentEvent(tx, {
        organizationId,
        developmentId: agreement.contract.developmentId,
        actorUserId: null,
        eventType: "contract.renegotiation_broken",
        entityType: "RenegotiationAgreement",
        entityId: agreement.id,
        payload: { agreementNumber: agreement.agreementNumber, reactivatedOriginal: rule.reactivateOriginalOnBreak },
      });
    });

    brokenCount += 1;
  }

  return { checked: agreements.length, brokenCount };
}

export function listRenegotiations(organizationId: string, contractId: string) {
  return prisma.renegotiationAgreement.findMany({
    where: { organizationId, contractId },
    include: { approvals: true, originInstallments: true, destinationInstallments: true },
    orderBy: { sequenceNumber: "asc" },
  });
}

export function getRenegotiation(organizationId: string, agreementId: string) {
  return prisma.renegotiationAgreement.findFirst({
    where: { id: agreementId, organizationId },
    include: { contract: true, approvals: true, originInstallments: true, destinationInstallments: true },
  });
}
