import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { recordDevelopmentEvent } from "@/lib/events";
import { changeUnitStatusTx } from "@/server/units";
import { tryReleaseCommissions } from "@/server/commissions";
import type { AccessContext } from "@/server/auth-context";
import type { PaymentFlowResult } from "@/lib/payment-flow";
import type { Prisma } from "@/generated/prisma/client";

export function getContractBySale(organizationId: string, saleId: string) {
  return prisma.contract.findFirst({
    where: { saleId, organizationId },
    include: {
      indexRule: true,
      customer: true,
      portfolio: {
        include: {
          installments: {
            include: { payments: true },
            orderBy: { sequence: "asc" },
          },
        },
      },
    },
  });
}

export function getContract(organizationId: string, contractId: string) {
  return prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    include: {
      unit: true,
      customer: true,
      development: true,
      indexRule: true,
      sale: { include: { proposal: true } },
      portfolio: {
        include: {
          installments: {
            include: { payments: true },
            orderBy: { sequence: "asc" },
          },
        },
      },
    },
  });
}

async function nextContractNumber(tx: Prisma.TransactionClient, organizationId: string) {
  const year = new Date().getFullYear();
  const count = await tx.contract.count({
    where: { organizationId, contractNumber: { startsWith: `CT-${year}-` } },
  });
  return `CT-${year}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * Gera a minuta (Contract em DRAFT) a partir de uma venda fechada. A
 * renderização da minuta em si é feita sob demanda em /contracts/[id] —
 * não existe motor de template ainda, só o preenchimento com os dados já
 * disponíveis (empreendimento, unidade, cliente, fluxo da proposta).
 */
export async function createContract(context: AccessContext, saleId: string, notes?: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, organizationId: context.organizationId },
    });
    if (!sale) throw new Error("Venda inválida.");

    const existing = await tx.contract.findUnique({ where: { saleId } });
    if (existing) throw new Error("Esta venda já possui contrato.");

    const contractNumber = await nextContractNumber(tx, context.organizationId);

    const contract = await tx.contract.create({
      data: {
        organizationId: context.organizationId,
        developmentId: sale.developmentId,
        unitId: sale.unitId,
        saleId: sale.id,
        customerId: sale.customerId,
        contractNumber,
        notes,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: "Contract",
      entityId: contract.id,
      afterData: contract,
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: sale.developmentId,
      actorUserId: context.userId,
      eventType: "contract.drafted",
      entityType: "Contract",
      entityId: contract.id,
      payload: { contractNumber },
    });

    return contract;
  });
}

export async function markAwaitingSignature(context: AccessContext, contractId: string) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findFirst({
      where: { id: contractId, organizationId: context.organizationId },
      include: { unit: true },
    });
    if (!contract) throw new Error("Contrato inválido.");
    if (contract.status !== "DRAFT") throw new Error("Contrato não está em rascunho.");

    const updated = await tx.contract.update({
      where: { id: contractId },
      data: { status: "AWAITING_SIGNATURE" },
    });

    if (contract.unit.status === "CONTRACT_IN_PROGRESS") {
      await changeUnitStatusTx(tx, {
        organizationId: context.organizationId,
        developmentId: contract.developmentId,
        unitId: contract.unitId,
        fromStatus: contract.unit.status,
        toStatus: "AWAITING_SIGNATURE",
        actorUserId: context.userId,
        reason: "Contrato enviado para assinatura",
      });
    }

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: contract.developmentId,
      actorUserId: context.userId,
      eventType: "contract.sent_for_signature",
      entityType: "Contract",
      entityId: contractId,
    });

    return updated;
  });
}

/**
 * Confirma a assinatura (manual — sem provedor de assinatura eletrônica
 * integrado na V1) e cria a carteira de recebíveis automaticamente a
 * partir do fluxo simulado na proposta (PRD seção 8). `signedDocumentPath`
 * é o caminho retornado por `uploadContractDocument` (Supabase Storage),
 * não uma URL — o link de download é gerado sob demanda com validade curta.
 */
export async function confirmSignature(
  context: AccessContext,
  contractId: string,
  signedDocumentPath?: string,
) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findFirst({
      where: { id: contractId, organizationId: context.organizationId },
      include: {
        sale: {
          include: { proposal: { include: { salesTable: true } }, commissionSplits: true },
        },
        portfolio: true,
        unit: true,
      },
    });
    if (!contract) throw new Error("Contrato inválido.");
    if (contract.status === "SIGNED") throw new Error("Contrato já está assinado.");
    if (contract.status === "CANCELLED") throw new Error("Contrato cancelado.");

    const signedAt = new Date();

    const updated = await tx.contract.update({
      where: { id: contractId },
      data: { status: "SIGNED", signedAt, signedDocumentPath },
    });

    if (contract.unit.status !== "SOLD" && contract.unit.status !== "CANCELLED") {
      await changeUnitStatusTx(tx, {
        organizationId: context.organizationId,
        developmentId: contract.developmentId,
        unitId: contract.unitId,
        fromStatus: contract.unit.status,
        toStatus: "SOLD",
        actorUserId: context.userId,
        reason: "Contrato assinado",
      });
    }

    if (!contract.portfolio) {
      const proposal = contract.sale.proposal;
      // Fluxo REAL negociado: a contra-proposta quando houve uma (Parte 5.1),
      // senão o fluxo da tabela padrão — nunca ignora o que foi de fato
      // avaliado/aprovado.
      const paymentFlow = (proposal.proposedPaymentFlow ?? proposal.paymentFlow) as unknown as PaymentFlowResult | null;
      const items = paymentFlow?.items ?? [];

      // Destino da entrada (Parte 4.2) — override da venda, senão o da
      // tabela de vendas, senão SPE_ACCOUNT (proposta totalmente fora de
      // tabela, sem SalesTable pra herdar).
      const destination = contract.sale.downPaymentDestinationOverride ?? proposal.salesTable?.downPaymentDestination ?? "SPE_ACCOUNT";

      const downPaymentItems = items.filter((item) => item.isDownPayment);
      const collectibleItems =
        destination === "BROKER_COMMISSION" ? items.filter((item) => !item.isDownPayment) : items;

      const totalValue = round2(collectibleItems.reduce((sum, item) => sum + item.amount, 0));

      const portfolio = await tx.receivablePortfolio.create({
        data: {
          organizationId: context.organizationId,
          contractId,
          totalValue,
        },
      });

      if (collectibleItems.length > 0) {
        await tx.installment.createMany({
          data: collectibleItems.map((item, index) => ({
            portfolioId: portfolio.id,
            sequence: index + 1,
            label: item.label,
            dueDate: addMonths(signedAt, item.dueOffsetMonths),
            originalValue: item.amount,
            isDownPayment: item.isDownPayment ?? false,
          })),
        });
      }

      // Entrada É a comissão (Parte 4.2): não entra na carteira da SPE —
      // abate da comissão devida; se sobrar, vira crédito à SPE (registrado
      // pra visibilidade do Financeiro, sem cobrança automática).
      if (destination === "BROKER_COMMISSION" && downPaymentItems.length > 0) {
        const downPaymentTotal = round2(downPaymentItems.reduce((sum, item) => sum + item.amount, 0));
        let remaining = downPaymentTotal;

        for (const split of contract.sale.commissionSplits) {
          if (remaining <= 0) break;
          const splitValue = Number(split.value);
          const deducted = Math.min(splitValue, remaining);
          remaining = round2(remaining - deducted);
          await tx.commissionSplit.update({
            where: { id: split.id },
            data: { value: round2(splitValue - deducted) },
          });
        }

        if (remaining > 0) {
          await tx.contract.update({ where: { id: contractId }, data: { downPaymentCommissionExcess: remaining } });
        }

        await recordDevelopmentEvent(tx, {
          organizationId: context.organizationId,
          developmentId: contract.developmentId,
          actorUserId: context.userId,
          eventType: "contract.down_payment_as_commission",
          entityType: "Contract",
          entityId: contractId,
          payload: { downPaymentTotal, commissionExcess: remaining > 0 ? remaining : undefined },
        });
      }

      await recordDevelopmentEvent(tx, {
        organizationId: context.organizationId,
        developmentId: contract.developmentId,
        actorUserId: context.userId,
        eventType: "receivable_portfolio.created",
        entityType: "ReceivablePortfolio",
        entityId: portfolio.id,
        payload: { installments: collectibleItems.length },
      });
    }

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "update",
      entityType: "Contract",
      entityId: contractId,
      beforeData: { status: contract.status },
      afterData: { status: "SIGNED" },
    });

    await recordDevelopmentEvent(tx, {
      organizationId: context.organizationId,
      developmentId: contract.developmentId,
      actorUserId: context.userId,
      eventType: "contract.signed",
      entityType: "Contract",
      entityId: contractId,
    });

    await tryReleaseCommissions(tx, context.organizationId, contractId, context.userId);

    return updated;
  });
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
