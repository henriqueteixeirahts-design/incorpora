import "server-only";

import { prisma } from "@/lib/prisma";
import { getInstallmentLivePosition } from "@/server/receivables";
import type { CalculateInstallmentResult } from "@/lib/index-correction";
import type { AccessContext } from "@/server/auth-context";
import { canAccessDevelopment } from "@/server/scope";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type InstallmentStatementRow = {
  id: string;
  sequence: number;
  label: string;
  isDownPayment: boolean;
  dueDate: Date;
  originalValue: number;
  resultValue: number; // "valor corrigido" — na data de referência, ou na data do pagamento se paga
  fineAmount: number;
  overdueInterestAmount: number;
  daysOverdue: number;
  status: string;
  situationLabel: string;
  renegotiatedByAmendmentNumber: string | null; // "Renegociada (link pro acordo)" — só quando cancelada por um aditivo de renegociação de fluxo assinado
  payments: { id: string; amount: number; paidAt: Date; method: string | null }[];
  details: CalculateInstallmentResult["details"] | null;
};

export type ContractStatement = {
  contractId: string;
  contractNumber: string;
  developmentId: string;
  developmentName: string;
  unitNumber: string;
  contractStatus: string;
  situationLabel: string; // Em dia / Em atraso / Renegociado / Quitado / Distratado
  contractedValue: number;
  totalPaid: number;
  outstandingBalance: number; // saldo devedor atual, corrigido na data de referência
  percentPaid: number;
  distratoNumber: string | null;
  installments: InstallmentStatementRow[];
};

export type CustomerFinancialPosition = {
  customerId: string;
  customerName: string;
  customerDocument: string;
  asOfDate: Date;
  consolidated: {
    contractedValue: number;
    totalPaid: number;
    outstandingBalance: number;
    percentPaid: number;
    situationLabel: string;
  };
  contracts: ContractStatement[];
};

const SITUATION_LABELS: Record<string, string> = {
  EM_DIA: "Em dia",
  EM_ATRASO: "Em atraso",
  RENEGOCIADO: "Renegociado",
  QUITADO: "Quitado",
  DISTRATADO: "Distratado",
};

const INSTALLMENT_SITUATION_LABELS: Record<string, string> = {
  PENDING: "Em aberto",
  PARTIALLY_PAID: "Em aberto (parcial)",
  PAID: "Paga",
  OVERDUE: "Vencida",
  CANCELLED: "Cancelada",
};

/**
 * Posição financeira completa de um cliente (Fase B, Parte 1) — todos os
 * contratos com carteira (minutas sem assinatura ainda não têm carteira,
 * ficam fora), com o valor corrigido calculado AO VIVO (reaproveitando o
 * motor de correção já existente — `getInstallmentLivePosition`, puro,
 * nunca grava `FinancialCalculation`) na data de referência pedida. É
 * exibição da posição, não um recálculo novo.
 *
 * Escopo por empreendimento (docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte
 * 2.5): um cliente pode ter contratos em mais de um empreendimento — um
 * usuário restrito a um empreendimento vê só os contratos dele (o extrato
 * fica parcial, não bloqueado por inteiro), e os totais `consolidated.*`
 * somam só o que ele pode ver. Nunca vaza valor de contrato fora do escopo.
 */
export async function getCustomerFinancialPosition(
  context: AccessContext,
  customerId: string,
  asOfDate: Date = new Date(),
): Promise<CustomerFinancialPosition | null> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: context.organizationId },
    include: {
      contracts: {
        where: { portfolio: { isNot: null } },
        include: {
          indexRule: { include: { values: true } },
          development: { include: { postHabiteSeIndexRule: { include: { values: true } } } },
          unit: true,
          amendments: { where: { status: "SIGNED", type: "FLOW_RENEGOTIATION" } },
          distrato: true,
          portfolio: {
            include: { installments: { include: { payments: true }, orderBy: { sequence: "asc" } } },
          },
        },
      },
    },
  });
  if (!customer) return null;

  const visibleContracts = customer.contracts.filter((c) => canAccessDevelopment(context, c.developmentId));

  const contracts: ContractStatement[] = visibleContracts.map((contract) => {
    // docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 4 — parcelas totalmente
    // destinadas à comissão externa (externalCommissionPortion ==
    // originalValue) são invisíveis ao portal do cliente (nunca foram
    // receita da SPE). A parcela-fronteira (parcialmente destinada) mostra
    // só a fatia reconhecida como SPE — originalValue e os pagamentos
    // exibidos são líquidos da fatia do corretor; a correção/juros
    // (resultValue) segue calculada sobre a parcela contratual inteira
    // (não recalculada sobre o valor líquido — aproximação consciente,
    // display-only, não afeta nenhum valor de fato cobrado/devido).
    const installments = (contract.portfolio?.installments ?? []).filter(
      (i) => Number(i.externalCommissionPortion) < Number(i.originalValue),
    );

    const installmentRows: InstallmentStatementRow[] = installments.map((installment) => {
      const position = getInstallmentLivePosition(
        {
          status: installment.status,
          originalValue: Number(installment.originalValue),
          correctedValue: installment.correctedValue ? Number(installment.correctedValue) : null,
          lastCalculatedAt: installment.lastCalculatedAt,
          dueDate: installment.dueDate,
          correctionExempt: installment.correctionExempt,
        },
        contract,
        contract.development,
        asOfDate,
      );

      const renegotiatedByAmendmentNumber =
        installment.status === "CANCELLED" && contract.amendments.length > 0 ? contract.amendments[0].amendmentNumber : null;

      // "Vencida" é decidido pelo cálculo AO VIVO (dias em atraso na data de
      // referência), não pelo `status` persistido — esse só é atualizado
      // quando algo grava (recebimento, cron de recálculo), podendo estar
      // desatualizado no meio do período; o extrato não pode depender disso.
      const isLiveOverdue = installment.status !== "PAID" && installment.status !== "CANCELLED" && position.daysOverdue > 0;
      const liveStatus = isLiveOverdue ? "OVERDUE" : installment.status;

      return {
        id: installment.id,
        sequence: installment.sequence,
        label: installment.label,
        isDownPayment: installment.isDownPayment,
        dueDate: installment.dueDate,
        originalValue: round2(Number(installment.originalValue) - Number(installment.externalCommissionPortion)),
        resultValue: position.resultValue,
        fineAmount: position.fineAmount,
        overdueInterestAmount: position.overdueInterestAmount,
        daysOverdue: position.daysOverdue,
        status: liveStatus,
        situationLabel: renegotiatedByAmendmentNumber
          ? "Renegociada"
          : (INSTALLMENT_SITUATION_LABELS[liveStatus] ?? liveStatus),
        renegotiatedByAmendmentNumber,
        payments: installment.payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          paidAt: p.paidAt,
          method: p.method,
        })),
        details: position.details,
      };
    });

    // totalPaid usa paidAmount líquido da fatia de comissão externa
    // (installment.paidAmount - externalCommissionRecognized), não a soma
    // bruta de `payments` — esse dinheiro nunca foi receita da SPE.
    const totalPaid = round2(
      installments.reduce((sum, i) => sum + Number(i.paidAmount) - Number(i.externalCommissionRecognized), 0),
    );
    const outstandingBalance = round2(
      installmentRows.filter((i) => i.status !== "PAID" && i.status !== "CANCELLED").reduce((sum, i) => sum + i.resultValue, 0),
    );
    const contractedValue = contract.portfolio
      ? round2(
          Number(contract.portfolio.totalValue) -
            (contract.portfolio.installments ?? []).reduce((sum, i) => sum + Number(i.externalCommissionPortion), 0),
        )
      : 0;
    const percentPaid = contractedValue > 0 ? round2(Math.min(100, (totalPaid / contractedValue) * 100)) : 0;

    const isDistrato = contract.status === "CANCELLED" && contract.distrato?.status === "SIGNED";
    const hasOpenExposure = installmentRows.some((i) => i.status !== "PAID" && i.status !== "CANCELLED");
    const hasOverdue = installmentRows.some((i) => i.status === "OVERDUE");
    const isRenegotiated = contract.amendments.length > 0;

    let situationCode: keyof typeof SITUATION_LABELS;
    if (isDistrato) situationCode = "DISTRATADO";
    else if (hasOverdue) situationCode = "EM_ATRASO";
    else if (!hasOpenExposure) situationCode = "QUITADO";
    else if (isRenegotiated) situationCode = "RENEGOCIADO";
    else situationCode = "EM_DIA";

    return {
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      developmentId: contract.developmentId,
      developmentName: contract.development.name,
      unitNumber: contract.unit.number,
      contractStatus: contract.status,
      situationLabel: SITUATION_LABELS[situationCode],
      contractedValue,
      totalPaid,
      outstandingBalance,
      percentPaid,
      distratoNumber: contract.distrato?.distratoNumber ?? null,
      installments: installmentRows,
    };
  });

  const consolidatedContractedValue = round2(contracts.reduce((sum, c) => sum + c.contractedValue, 0));
  const consolidatedTotalPaid = round2(contracts.reduce((sum, c) => sum + c.totalPaid, 0));
  const consolidatedOutstanding = round2(contracts.reduce((sum, c) => sum + c.outstandingBalance, 0));
  const consolidatedPercentPaid =
    consolidatedContractedValue > 0 ? round2(Math.min(100, (consolidatedTotalPaid / consolidatedContractedValue) * 100)) : 0;

  const consolidatedSituation = contracts.some((c) => c.situationLabel === "Em atraso")
    ? "Em atraso"
    : contracts.some((c) => c.situationLabel === "Em dia" || c.situationLabel === "Renegociado")
      ? "Em dia"
      : contracts.length > 0
        ? "Quitado"
        : "Sem contratos com carteira";

  return {
    customerId: customer.id,
    customerName: customer.name,
    customerDocument: customer.document,
    asOfDate,
    consolidated: {
      contractedValue: consolidatedContractedValue,
      totalPaid: consolidatedTotalPaid,
      outstandingBalance: consolidatedOutstanding,
      percentPaid: consolidatedPercentPaid,
      situationLabel: consolidatedSituation,
    },
    contracts,
  };
}
