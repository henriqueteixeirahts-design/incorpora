import "server-only";

import { prisma } from "@/lib/prisma";

export type UnitSaleDetail = {
  saleId: string;
  contractId: string;
  contractNumber: string;
  contractStatus: string;
  saleDate: Date;
  salePrice: number;
  customerName: string;
  customerDocument: string;
  commission: { beneficiaryName: string; percent: number; value: number } | null;
  installments: { paidCount: number; totalCount: number; totalValue: number };
  installmentGroups: { label: string; count: number; paidCount: number; value: number }[];
};

/**
 * Dados de contrato/cliente/comissão/carteira de uma unidade vendida, pro
 * painel de detalhe do espelho de vendas — carregado sob demanda (só quando
 * a unidade selecionada tem contrato), não pré-carregado pra todas as
 * unidades do empreendimento.
 */
export async function getUnitSaleDetail(organizationId: string, unitId: string): Promise<UnitSaleDetail | null> {
  const contract = await prisma.contract.findFirst({
    where: { unitId, organizationId },
    include: {
      customer: true,
      sale: { include: { commissionSplits: true } },
      portfolio: { include: { installments: true } },
    },
  });
  if (!contract) return null;

  const primarySplit = contract.sale.commissionSplits.find((split) => split.brokerId || split.agencyId) ?? null;
  let commission: UnitSaleDetail["commission"] = null;
  if (primarySplit) {
    const beneficiary = primarySplit.brokerId
      ? await prisma.broker.findUnique({ where: { id: primarySplit.brokerId }, select: { name: true } })
      : primarySplit.agencyId
        ? await prisma.realEstateAgency.findUnique({ where: { id: primarySplit.agencyId }, select: { name: true } })
        : null;
    commission = {
      beneficiaryName: beneficiary?.name ?? primarySplit.label ?? "—",
      percent: Number(primarySplit.percent),
      value: Number(primarySplit.value),
    };
  }

  const installments = contract.portfolio?.installments ?? [];

  const groupsByLabel = new Map<string, { count: number; paidCount: number; value: number }>();
  for (const installment of installments) {
    const group = groupsByLabel.get(installment.label) ?? { count: 0, paidCount: 0, value: 0 };
    group.count += 1;
    if (installment.status === "PAID") group.paidCount += 1;
    group.value += Number(installment.originalValue);
    groupsByLabel.set(installment.label, group);
  }
  const installmentGroups = [...groupsByLabel.entries()]
    .map(([label, group]) => ({ label, ...group }))
    .sort((a, b) => b.value - a.value);

  return {
    saleId: contract.saleId,
    contractId: contract.id,
    contractNumber: contract.contractNumber,
    contractStatus: contract.status,
    saleDate: contract.sale.saleDate,
    salePrice: Number(contract.sale.salePrice),
    customerName: contract.customer.name,
    customerDocument: contract.customer.document,
    commission,
    installments: {
      paidCount: installments.filter((i) => i.status === "PAID").length,
      totalCount: installments.length,
      totalValue: installments.reduce((sum, i) => sum + Number(i.originalValue), 0),
    },
    installmentGroups,
  };
}
