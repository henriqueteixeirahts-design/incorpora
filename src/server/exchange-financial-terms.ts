import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { developmentOwnedScope, canAccessDevelopment } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";
import type {
  ExchangeIncidenceScope,
  ExchangePayoutFlow,
  ExchangeDeductionBase,
  ExchangeRetentionReleaseTrigger,
} from "@/generated/prisma/client";

const ENTITY_TYPE = "ExchangeContractFinancialTerms";

async function getExchangeContractOwned(context: AccessContext, exchangeContractId: string) {
  const contract = await prisma.exchangeContract.findFirst({
    where: { id: exchangeContractId, ...developmentOwnedScope(context) },
  });
  if (!contract || !canAccessDevelopment(context, contract.developmentId)) {
    throw new Error("Contrato de permuta não encontrado.");
  }
  if (contract.type === "PHYSICAL") throw new Error("Contrato de permuta física não tem condições financeiras.");
  return contract;
}

export function getExchangeFinancialTerms(context: AccessContext, exchangeContractId: string) {
  return getExchangeContractOwned(context, exchangeContractId).then(() =>
    prisma.exchangeContractFinancialTerms.findUnique({
      where: { exchangeContractId },
      include: { units: true },
    }),
  );
}

export type UpsertExchangeFinancialTermsInput = {
  percent: number;
  incidenceScope: ExchangeIncidenceScope;
  incidenceCapValue?: number;
  payoutFlow: ExchangePayoutFlow;
  milestoneDescription?: string;
  milestoneTargetUnitsSoldPct?: number;
  deductionBase: ExchangeDeductionBase;
  deductCommission?: boolean;
  deductTax?: boolean;
  retentionPct?: number;
  retentionReleaseTrigger?: ExchangeRetentionReleaseTrigger;
  retentionReleaseDate?: Date;
  correctionIndexRuleId?: string;
  unitIds?: string[]; // só relevante quando incidenceScope = SPECIFIC_UNITS
};

export async function upsertExchangeFinancialTerms(
  context: AccessContext,
  exchangeContractId: string,
  input: UpsertExchangeFinancialTermsInput,
) {
  const contract = await getExchangeContractOwned(context, exchangeContractId);
  if (input.incidenceScope === "VALUE_CAP" && (input.incidenceCapValue === undefined || input.incidenceCapValue <= 0)) {
    throw new Error("Informe o valor-teto da incidência.");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.exchangeContractFinancialTerms.findUnique({ where: { exchangeContractId } });

    const data = {
      percent: input.percent,
      incidenceScope: input.incidenceScope,
      incidenceCapValue: input.incidenceScope === "VALUE_CAP" ? input.incidenceCapValue : null,
      payoutFlow: input.payoutFlow,
      milestoneDescription: input.payoutFlow === "MILESTONES" ? input.milestoneDescription : null,
      milestoneTargetUnitsSoldPct: input.payoutFlow === "MILESTONES" ? input.milestoneTargetUnitsSoldPct : null,
      deductionBase: input.deductionBase,
      deductCommission: input.deductCommission ?? false,
      deductTax: input.deductTax ?? false,
      retentionPct: input.retentionPct,
      retentionReleaseTrigger: input.retentionReleaseTrigger,
      retentionReleaseDate: input.retentionReleaseDate,
      correctionIndexRuleId: input.correctionIndexRuleId,
    };

    const terms = existing
      ? await tx.exchangeContractFinancialTerms.update({ where: { exchangeContractId }, data })
      : await tx.exchangeContractFinancialTerms.create({ data: { exchangeContractId, ...data } });

    if (input.incidenceScope === "SPECIFIC_UNITS") {
      await tx.exchangeContractFinancialUnit.deleteMany({ where: { financialTermsId: terms.id } });
      const unitIds = input.unitIds ?? [];
      if (unitIds.length > 0) {
        const validCount = await tx.unit.count({ where: { id: { in: unitIds }, developmentId: contract.developmentId } });
        if (validCount !== unitIds.length) throw new Error("Unidade inválida para este empreendimento.");
        await tx.exchangeContractFinancialUnit.createMany({
          data: unitIds.map((unitId) => ({ financialTermsId: terms.id, unitId })),
        });
      }
    } else {
      await tx.exchangeContractFinancialUnit.deleteMany({ where: { financialTermsId: terms.id } });
    }

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: existing ? "update" : "create",
      entityType: ENTITY_TYPE,
      entityId: terms.id,
      beforeData: existing ?? undefined,
      afterData: terms,
    });

    return terms;
  });
}
