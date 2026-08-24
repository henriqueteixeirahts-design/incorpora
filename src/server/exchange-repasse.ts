import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { developmentOwnedScope, canAccessDevelopment } from "@/server/scope";
import { calculatePhysicalRepasse } from "@/lib/exchange-repasse";
import type { AccessContext } from "@/server/auth-context";
import type { Prisma } from "@/generated/prisma/client";

const REPASSE_ENTITY_TYPE = "ExchangeRepasse";
const RETENTION_RELEASE_ENTITY_TYPE = "ExchangeRetentionRelease";

/** Find-or-create — mesmo padrão de fornecedor=corretor/imobiliária/investidor já usado em commissions.ts/spe-investor-returns.ts. */
async function getOrCreateSupplierForPermutante(tx: Prisma.TransactionClient, organizationId: string, permutanteId: string) {
  const existing = await tx.supplier.findUnique({ where: { permutanteId } });
  if (existing) return existing;

  const permutante = await tx.permutante.findUniqueOrThrow({ where: { id: permutanteId } });
  return tx.supplier.create({
    data: {
      organizationId,
      permutanteId,
      name: permutante.name,
      document: permutante.document,
      email: permutante.email,
      phone: permutante.phone,
    },
  });
}

/**
 * Repasse de permuta física sob gestão (docs/ESPEC_PERMUTANTES.md, Etapa 3)
 * — chamado de dentro de `registerInstallmentPayment`
 * (src/server/receivables.ts), sempre na mesma transação do pagamento, logo
 * depois de `recognizeCommissionOnPayment` (cujos valores reconhecidos nesse
 * mesmo pagamento são reutilizados aqui, nunca recalculados). Só gera algo
 * quando a unidade da parcela está destacada num contrato PHYSICAL/MIXED sob
 * gestão do sistema (`managedBySystem = true`) — fora disso, a unidade nem
 * está no funil normal de vendas.
 */
export async function recognizeExchangePhysicalRepasseOnPayment(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    actorUserId: string | null;
    unitId: string;
    installmentPaymentId: string;
    paymentAmount: number;
    referenceDate: Date;
    externalCommissionAmount: number;
    internalCommissionAmount: number;
  },
) {
  const unit = await tx.unit.findUnique({
    where: { id: params.unitId },
    include: { exchangeContract: { include: { permutante: true } } },
  });
  const contract = unit?.exchangeContract;
  if (!contract) return null;
  if (contract.type === "FINANCIAL") return null;
  if (contract.managedBySystem !== true) return null;

  const calc = calculatePhysicalRepasse({
    paymentAmount: params.paymentAmount,
    administrationFeePct: contract.administrationFeePct ? Number(contract.administrationFeePct) : null,
    externalCommissionAmount: params.externalCommissionAmount,
    internalCommissionAmount: params.internalCommissionAmount,
    retentionPct: contract.retentionPct ? Number(contract.retentionPct) : null,
  });

  if (calc.grossBase <= 0) return null;

  const supplier = await getOrCreateSupplierForPermutante(tx, params.organizationId, contract.permutanteId);

  let payableId: string | null = null;
  if (calc.share > 0) {
    const payable = await tx.payable.create({
      data: {
        organizationId: params.organizationId,
        developmentId: contract.developmentId,
        supplierId: supplier.id,
        category: "EXCHANGE_REPASSE",
        description: `Repasse de permuta física — ${contract.permutante.name}`,
        competenceDate: params.referenceDate,
        dueDate: params.referenceDate,
        amount: calc.share,
      },
    });
    payableId = payable.id;
  }

  const repasse = await tx.exchangeRepasse.create({
    data: {
      exchangeContractId: contract.id,
      installmentPaymentId: params.installmentPaymentId,
      grossBase: calc.grossBase,
      administrationFeeAmount: calc.administrationFeeAmount,
      externalCommissionAmount: calc.externalCommissionAmount,
      internalCommissionAmount: calc.internalCommissionAmount,
      share: calc.share,
      payableId,
      referenceDate: params.referenceDate,
      details: calc,
    },
  });

  await recordAuditEvent(tx, {
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "create",
    entityType: REPASSE_ENTITY_TYPE,
    entityId: repasse.id,
    afterData: { ...repasse, payableId },
  });

  return repasse;
}

async function getExchangeContractScoped(context: AccessContext, exchangeContractId: string) {
  const contract = await prisma.exchangeContract.findFirst({
    where: { id: exchangeContractId, ...developmentOwnedScope(context) },
    include: { permutante: true },
  });
  if (!contract || !canAccessDevelopment(context, contract.developmentId)) {
    throw new Error("Contrato de permuta não encontrado.");
  }
  return contract;
}

/** Saldo retido disponível de um contrato — calculado ao vivo, nunca um contador persistido (mesmo princípio do saldo devedor do mútuo). */
export async function getExchangeRetentionBalance(context: AccessContext, exchangeContractId: string) {
  await getExchangeContractScoped(context, exchangeContractId);

  // `retainedAmount` não é uma coluna própria em ExchangeRepasse (fica dentro
  // de `details`, memória completa do cálculo) — soma via leitura das linhas.
  const [repasses, releasedAgg] = await Promise.all([
    prisma.exchangeRepasse.findMany({ where: { exchangeContractId }, select: { details: true } }),
    prisma.exchangeRetentionRelease.aggregate({ where: { exchangeContractId }, _sum: { amount: true } }),
  ]);
  const totalRetained = repasses.reduce((sum, r) => {
    const details = r.details as { retainedAmount?: number };
    return sum + (details.retainedAmount ?? 0);
  }, 0);
  const totalReleased = Number(releasedAgg._sum.amount ?? 0);

  return Math.round((totalRetained - totalReleased) * 100) / 100;
}

/** Liberação de retenção (física ou financeira) — sempre ação manual, gera 1 Payable. */
export async function releaseExchangeRetention(
  context: AccessContext,
  exchangeContractId: string,
  input: { amount: number; releaseDate: Date; notes?: string },
) {
  const contract = await getExchangeContractScoped(context, exchangeContractId);
  const available = await getExchangeRetentionBalance(context, exchangeContractId);
  if (input.amount > available + 0.01) {
    throw new Error(`Valor de liberação (${input.amount.toFixed(2)}) excede o saldo retido disponível (${available.toFixed(2)}).`);
  }

  return prisma.$transaction(async (tx) => {
    const supplier = await getOrCreateSupplierForPermutante(tx, context.organizationId, contract.permutanteId);

    const payable = await tx.payable.create({
      data: {
        organizationId: context.organizationId,
        developmentId: contract.developmentId,
        supplierId: supplier.id,
        category: "EXCHANGE_RETENTION_RELEASE",
        description: `Liberação de retenção — ${contract.permutante.name}`,
        competenceDate: input.releaseDate,
        dueDate: input.releaseDate,
        amount: input.amount,
      },
    });

    const release = await tx.exchangeRetentionRelease.create({
      data: {
        exchangeContractId,
        amount: input.amount,
        releaseDate: input.releaseDate,
        payableId: payable.id,
        notes: input.notes,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: RETENTION_RELEASE_ENTITY_TYPE,
      entityId: release.id,
      afterData: { ...release, payable },
    });

    return release;
  });
}

export function listExchangeRepasses(context: AccessContext, exchangeContractId: string) {
  return getExchangeContractScoped(context, exchangeContractId).then(() =>
    prisma.exchangeRepasse.findMany({
      where: { exchangeContractId },
      orderBy: { referenceDate: "desc" },
    }),
  );
}

export function listExchangeRetentionReleases(context: AccessContext, exchangeContractId: string) {
  return getExchangeContractScoped(context, exchangeContractId).then(() =>
    prisma.exchangeRetentionRelease.findMany({
      where: { exchangeContractId },
      orderBy: { releaseDate: "desc" },
    }),
  );
}
