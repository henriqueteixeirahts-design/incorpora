import "server-only";

import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { speOwnedScope } from "@/server/scope";
import type { AccessContext } from "@/server/auth-context";
import type { Prisma, SpeInvestorReturnType } from "@/generated/prisma/client";

const RETURN_ENTITY_TYPE = "SpeInvestorReturn";

const TYPE_TO_CATEGORY: Record<SpeInvestorReturnType, "RESULT_DISTRIBUTION" | "INVESTOR_RETURN"> = {
  RESULT_DISTRIBUTION: "RESULT_DISTRIBUTION",
  LOAN_AMORTIZATION: "INVESTOR_RETURN",
};

const TYPE_LABELS: Record<SpeInvestorReturnType, string> = {
  RESULT_DISTRIBUTION: "Distribuição de resultado",
  LOAN_AMORTIZATION: "Amortização de mútuo",
};

async function getInvestorScoped(context: AccessContext, investorId: string) {
  const investor = await prisma.speInvestor.findFirst({ where: { id: investorId, ...speOwnedScope(context) } });
  if (!investor) throw new Error("Investidor não encontrado.");
  return investor;
}

/** Find-or-create — mesmo padrão de fornecedor=corretor/imobiliária/cliente já usado em commissions.ts/contract-distratos.ts. */
async function getOrCreateSupplierForInvestor(tx: Prisma.TransactionClient, organizationId: string, investorId: string) {
  const existing = await tx.supplier.findUnique({ where: { speInvestorId: investorId } });
  if (existing) return existing;

  const investor = await tx.speInvestor.findUniqueOrThrow({ where: { id: investorId } });
  return tx.supplier.create({
    data: {
      organizationId,
      speInvestorId: investorId,
      name: investor.name,
      document: investor.document,
      email: investor.email,
      phone: investor.phone,
    },
  });
}

function formatReturnBankAccount(investor: {
  returnBankName: string | null;
  returnBankAgency: string | null;
  returnBankAccount: string | null;
  returnPixKeyType: string | null;
  returnPixKeyValue: string | null;
}) {
  const parts: string[] = [];
  if (investor.returnBankName) {
    parts.push(`${investor.returnBankName}${investor.returnBankAgency ? ` ag. ${investor.returnBankAgency}` : ""}${investor.returnBankAccount ? ` cc ${investor.returnBankAccount}` : ""}`);
  }
  if (investor.returnPixKeyValue) {
    parts.push(`Pix${investor.returnPixKeyType ? ` (${investor.returnPixKeyType})` : ""}: ${investor.returnPixKeyValue}`);
  }
  return parts.length > 0 ? parts.join(" — ") : null;
}

export function listInvestorReturns(context: AccessContext, investorId: string) {
  return getInvestorScoped(context, investorId).then(() =>
    prisma.speInvestorReturn.findMany({
      where: { investorId },
      include: { payable: true },
      orderBy: { referenceDate: "desc" },
    }),
  );
}

export type CreateInvestorReturnInput = {
  type: SpeInvestorReturnType;
  amount: number;
  referenceDate: Date;
  dueDate: Date;
  notes?: string;
};

/**
 * Registra uma devolução (amortização de mútuo) ou distribuição (resultado)
 * ao investidor — gera a Payable (fornecedor = investidor, find-or-create),
 * que segue o fluxo de aprovação normal do financeiro (docs/ESPEC_APORTES_
 * INVESTIDORES.md, Parte 3). Valor sempre informado manualmente nesta etapa
 * — o cálculo automático do saldo devedor de mútuo é a Etapa 5.
 */
export async function createInvestorReturn(context: AccessContext, investorId: string, input: CreateInvestorReturnInput) {
  const investor = await getInvestorScoped(context, investorId);

  return prisma.$transaction(async (tx) => {
    const supplier = await getOrCreateSupplierForInvestor(tx, context.organizationId, investorId);

    const payable = await tx.payable.create({
      data: {
        organizationId: context.organizationId,
        speId: investor.speId,
        supplierId: supplier.id,
        category: TYPE_TO_CATEGORY[input.type],
        description: `${TYPE_LABELS[input.type]} — ${investor.name}`,
        competenceDate: input.referenceDate,
        dueDate: input.dueDate,
        amount: input.amount,
        bankAccount: formatReturnBankAccount(investor),
      },
    });

    const investorReturn = await tx.speInvestorReturn.create({
      data: {
        investorId,
        type: input.type,
        amount: input.amount,
        referenceDate: input.referenceDate,
        payableId: payable.id,
        notes: input.notes,
      },
    });

    await recordAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: "create",
      entityType: RETURN_ENTITY_TYPE,
      entityId: investorReturn.id,
      afterData: { ...investorReturn, payable },
    });

    return investorReturn;
  });
}
