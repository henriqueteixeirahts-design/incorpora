import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { changeUnitStatusTx } from "@/server/units";
import { getEffectiveDistratoRule } from "@/server/distrato-rules";
import { getEffectiveCommissionRule } from "@/server/commission-rules";
import { calculateDistratoSettlement } from "@/lib/distrato-settlement";
import type { AccessContext } from "@/server/auth-context";
import { canAccessDevelopment } from "@/server/scope";
import type { Prisma } from "@/generated/prisma/client";

async function getOrCreateSupplierForCustomer(tx: Prisma.TransactionClient, organizationId: string, customerId: string) {
  const existing = await tx.supplier.findUnique({ where: { customerId } });
  if (existing) return existing;

  const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
  return tx.supplier.create({
    data: { organizationId, customerId, name: customer.name, document: customer.document, email: customer.email, phone: customer.phone },
  });
}

// docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 4/caso de teste 6 — "o que o
// corretor já recebeu não volta, não entra no acerto": o totalPaid usado no
// cálculo do distrato precisa excluir a fatia já reconhecida como comissão
// externa (nunca foi receita da SPE, não pode ser nem devolvida nem retida).
function sumPaid(installments: { paidAmount: unknown; externalCommissionRecognized: unknown }[]) {
  return installments.reduce((sum, i) => sum + Number(i.paidAmount) - Number(i.externalCommissionRecognized), 0);
}

export type CreateDistratoInput = {
  brokerageDeductionAmount?: number;
  occupancyFeeAmount?: number;
  refundDueDate: Date;
  refundTerms?: string;
  reason?: string;
};

/**
 * Cria o distrato em rascunho: calcula o acerto (demonstrativo) a partir do
 * estado atual da carteira e da regra de retenção do empreendimento, mas
 * ainda não produz nenhum efeito — só ao assinar (`signDistrato`) é que o
 * contrato é encerrado de fato. Só um distrato por contrato (rescindir é
 * terminal) — a constraint `@unique` em `contractId` garante isso no banco,
 * mas valida antes com uma mensagem melhor.
 */
export async function createDistrato(context: AccessContext, contractId: string, input: CreateDistratoInput) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findFirst({
      where: { id: contractId, organizationId: context.organizationId },
      include: { portfolio: { include: { installments: true } }, distrato: true, sale: { include: { commissionSplits: true } } },
    });
    if (!contract || !canAccessDevelopment(context, contract.developmentId)) throw new Error("Contrato inválido.");
    if (contract.status !== "SIGNED") throw new Error("Só é possível distratar contrato assinado.");
    if (contract.distrato) throw new Error("Este contrato já tem um distrato — rescisão é terminal, não é possível criar outro.");

    const rule = await getEffectiveDistratoRule(context.organizationId, contract.developmentId);
    const totalPaid = sumPaid(contract.portfolio?.installments ?? []);

    // Comissão interna (Natureza 2, "integra o preço" —
    // docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 4) auto-calculada a
    // partir do accruedAmount já reconhecido (dinheiro que o cliente já
    // pagou e que já gerou direito ao gerente) — override manual explícito
    // (input.brokerageDeductionAmount) sempre tem prioridade.
    const internalSplit = contract.sale.commissionSplits.find((s) => s.beneficiaryType === "MANAGER");
    const autoBrokerageDeduction = internalSplit ? Number(internalSplit.accruedAmount) : undefined;

    const settlement = calculateDistratoSettlement({
      totalPaid,
      retentionPercent: rule.retentionPercent,
      brokerageDeductionAmount: input.brokerageDeductionAmount ?? autoBrokerageDeduction,
      occupancyFeeAmount: input.occupancyFeeAmount,
    });

    const distratoNumber = `${contract.contractNumber}-DT01`;

    const distrato = await tx.contractDistrato.create({
      data: {
        organizationId: context.organizationId,
        contractId,
        distratoNumber,
        totalPaid: settlement.totalPaid,
        retentionPercent: settlement.retentionPercent,
        retentionAmount: settlement.retentionAmount,
        brokerageDeductionAmount: settlement.brokerageDeductionAmount,
        occupancyFeeAmount: settlement.occupancyFeeAmount,
        refundAmount: settlement.refundAmount,
        refundDueDate: input.refundDueDate,
        refundTerms: input.refundTerms,
        reason: input.reason,
        createdByUserId: context.userId,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "ContractDistrato",
      entityId: distrato.id,
      afterData: distrato,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: contract.developmentId,
      actorUserId: context.userId,
      eventType: "contract.distrato_drafted",
      entityType: "ContractDistrato",
      entityId: distrato.id,
      payload: { distratoNumber, refundAmount: settlement.refundAmount },
    });

    return distrato;
  });
}

/**
 * Assina o distrato: recalcula `totalPaid` contra o estado ATUAL da
 * carteira (pode ter crescido se o cliente pagou algo a mais durante o
 * rascunho) — mas `retentionPercent` e as deduções ficam travadas no que
 * foi lançado no rascunho (são os valores que já constam do demonstrativo
 * gerado/assinado, não devem mudar silenciosamente na hora H). Efeitos, em
 * ordem: contrato -> CANCELLED; unidade -> AVAILABLE (volta a Disponível no
 * espelho, spec 2.4); parcelas ainda não recebidas (PENDING/OVERDUE) ->
 * CANCELLED (nunca deletadas — histórico preservado, mesmo padrão da etapa
 * 4); parcelas já recebidas (PAID/PARTIALLY_PAID) nunca são tocadas;
 * comissões ainda não pagas (PENDING/RELEASED) estornadas (CANCELLED) se a
 * regra do empreendimento mandar — comissões já faturadas/pagas não são
 * mexidas (dinheiro já saiu, estorno automático não é seguro); devolução
 * lançada como conta a pagar (fornecedor = cliente, find-or-create, mesmo
 * padrão da comissão) quando o valor a devolver é maior que zero.
 */
export async function signDistrato(context: AccessContext, distratoId: string, signedDocumentPath?: string) {
  return prisma.$transaction(async (tx) => {
    const distrato = await tx.contractDistrato.findFirst({
      where: { id: distratoId, organizationId: context.organizationId },
      include: {
        contract: {
          include: {
            unit: true,
            portfolio: { include: { installments: true } },
            sale: { include: { commissionSplits: true } },
          },
        },
      },
    });
    if (!distrato || !canAccessDevelopment(context, distrato.contract.developmentId)) throw new Error("Distrato inválido.");
    if (distrato.status === "SIGNED") throw new Error("Distrato já assinado.");
    if (distrato.contract.status !== "SIGNED") throw new Error("Contrato não está mais assinado/vigente.");

    const contract = distrato.contract;
    const installments = contract.portfolio?.installments ?? [];
    const totalPaid = sumPaid(installments);

    const settlement = calculateDistratoSettlement({
      totalPaid,
      retentionPercent: Number(distrato.retentionPercent),
      brokerageDeductionAmount: distrato.brokerageDeductionAmount ? Number(distrato.brokerageDeductionAmount) : undefined,
      occupancyFeeAmount: distrato.occupancyFeeAmount ? Number(distrato.occupancyFeeAmount) : undefined,
    });

    const signedAt = new Date();

    await tx.contract.update({ where: { id: contract.id }, data: { status: "CANCELLED" } });

    if (contract.unit.status !== "AVAILABLE") {
      await changeUnitStatusTx(tx, {
        organizationId: context.organizationId,
        developmentId: contract.developmentId,
        unitId: contract.unitId,
        fromStatus: contract.unit.status,
        toStatus: "AVAILABLE",
        actorUserId: context.userId,
        reason: `Distrato ${distrato.distratoNumber}`,
      });
    }

    const toCancel = installments.filter((i) => i.status === "PENDING" || i.status === "OVERDUE");
    for (const installment of toCancel) {
      await tx.installment.update({ where: { id: installment.id }, data: { status: "CANCELLED" } });
    }

    const rule = await getEffectiveDistratoRule(context.organizationId, contract.developmentId);
    // Splits MANAGER (Natureza 2) do modelo novo nunca são estornados aqui —
    // o que já foi acumulado (accruedAmount) reflete dinheiro que o cliente
    // já pagou e não volta (mesmo "sem estorno" da comissão externa); o que
    // ainda não foi pago simplesmente para de acumular sozinho, porque as
    // parcelas em aberto acabam de virar CANCELLED (não é possível registrar
    // pagamento nelas — ver registerInstallmentPayment).
    const commissionRule = await getEffectiveCommissionRule(context.organizationId, contract.developmentId);
    const usesNewInternalModel = commissionRule.internalCommissionPercent !== null;

    let reversedCommissions = 0;
    if (rule.reverseCommissionOnDistrato) {
      const toReverse = contract.sale.commissionSplits.filter(
        (s) => (s.status === "PENDING" || s.status === "RELEASED") && !(usesNewInternalModel && s.beneficiaryType === "MANAGER"),
      );
      for (const split of toReverse) {
        await tx.commissionSplit.update({ where: { id: split.id }, data: { status: "CANCELLED" } });
      }
      reversedCommissions = toReverse.length;
    }

    let refundPayableId: string | null = null;
    if (settlement.refundAmount > 0) {
      const supplier = await getOrCreateSupplierForCustomer(tx, context.organizationId, contract.customerId);
      const payable = await tx.payable.create({
        data: {
          organizationId: context.organizationId,
          developmentId: contract.developmentId,
          supplierId: supplier.id,
          contractId: contract.id,
          category: "CANCELLATION_REFUND",
          description: `Devolução distrato ${distrato.distratoNumber}`,
          competenceDate: signedAt,
          dueDate: distrato.refundDueDate,
          amount: settlement.refundAmount,
          notes: distrato.refundTerms,
        },
      });
      refundPayableId = payable.id;
    }

    const updated = await tx.contractDistrato.update({
      where: { id: distratoId },
      data: {
        status: "SIGNED",
        signedAt,
        signedDocumentPath,
        totalPaid: settlement.totalPaid,
        retentionAmount: settlement.retentionAmount,
        refundAmount: settlement.refundAmount,
        refundPayableId,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Contract",
      entityId: contract.id,
      beforeData: { status: "SIGNED" },
      afterData: { status: "CANCELLED" },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "ContractDistrato",
      entityId: distratoId,
      beforeData: { status: "DRAFT" },
      afterData: { status: "SIGNED" },
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: contract.developmentId,
      actorUserId: context.userId,
      eventType: "contract.distrato_signed",
      entityType: "ContractDistrato",
      entityId: distratoId,
      payload: {
        distratoNumber: distrato.distratoNumber,
        totalPaid: settlement.totalPaid,
        retentionAmount: settlement.retentionAmount,
        refundAmount: settlement.refundAmount,
        cancelledInstallments: toCancel.length,
        reversedCommissions,
      },
    });

    return updated;
  });
}

export async function getDistratoByContract(context: AccessContext, contractId: string) {
  const distrato = await prisma.contractDistrato.findFirst({
    where: { organizationId: context.organizationId, contractId },
    include: { refundPayable: true, contract: { select: { developmentId: true } } },
  });
  if (!distrato || !canAccessDevelopment(context, distrato.contract.developmentId)) return null;
  return distrato;
}

export async function getDistrato(context: AccessContext, distratoId: string) {
  const distrato = await prisma.contractDistrato.findFirst({
    where: { id: distratoId, organizationId: context.organizationId },
    include: { contract: true, refundPayable: true },
  });
  if (!distrato || !canAccessDevelopment(context, distrato.contract.developmentId)) return null;
  return distrato;
}
