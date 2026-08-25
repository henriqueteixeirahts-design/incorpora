import "server-only";

import { prisma } from "@/lib/prisma";
import { getPortfolioAging, getOverdueCustomerStages } from "@/server/aging";
import { getCommissionStatement } from "@/server/commissions";
import { listPayablesForExport } from "@/server/payables";
import { getReceivablesSummary } from "@/server/reports";
import { getCashFlow } from "@/server/cash-flow";
import { listDevelopments } from "@/server/developments";
import { UNIT_STATUS_META } from "@/lib/unit-status";
import type { AccessContext } from "@/server/auth-context";
import { developmentAccessScope } from "@/server/scope";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type ReportColumnType = "text" | "currency" | "date" | "percent" | "number";
export type ReportColumn = { key: string; label: string; type: ReportColumnType };
export type ReportRow = Record<string, string | number | Date | null>;
export type ReportResult = { title: string; columns: ReportColumn[]; rows: ReportRow[] };

export const REPORT_GROUPS = [
  {
    group: "Comercial",
    reports: [
      { key: "sales-map", label: "Mapa de vendas por empreendimento" },
      { key: "sales-period", label: "Vendas por período" },
      { key: "proposals-period", label: "Propostas do período" },
      { key: "reservations", label: "Reservas ativas e histórico" },
      { key: "commissions", label: "Comissões" },
      { key: "distratos-period", label: "Distratos do período" },
    ],
  },
  {
    group: "Carteira",
    reports: [
      { key: "portfolio-position", label: "Posição da carteira" },
      { key: "receipts-period", label: "Extrato consolidado de recebimentos" },
      { key: "overdue-detailed", label: "Inadimplência detalhada" },
      { key: "renegotiations", label: "Renegociações" },
    ],
  },
  {
    group: "Financeiro",
    reports: [
      { key: "payables-period", label: "Contas a pagar" },
      { key: "cash-flow-detailed", label: "Fluxo de caixa detalhado" },
      { key: "result-by-development", label: "Resultado por empreendimento" },
    ],
  },
] as const;

export type ReportKey = (typeof REPORT_GROUPS)[number]["reports"][number]["key"];

export type ReportFilters = {
  developmentId?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export async function getReportData(context: AccessContext, key: ReportKey, filters: ReportFilters): Promise<ReportResult> {
  switch (key) {
    case "sales-map":
      return getSalesMapReport(context, filters);
    case "sales-period":
      return getSalesPeriodReport(context, filters);
    case "proposals-period":
      return getProposalsPeriodReport(context, filters);
    case "reservations":
      return getReservationsReport(context, filters);
    case "commissions":
      return getCommissionsReport(context, filters);
    case "distratos-period":
      return getDistratosPeriodReport(context, filters);
    case "portfolio-position":
      return getPortfolioPositionReport(context, filters);
    case "receipts-period":
      return getReceiptsPeriodReport(context, filters);
    case "overdue-detailed":
      return getOverdueDetailedReport(context, filters);
    case "renegotiations":
      return getRenegotiationsReport(context, filters);
    case "payables-period":
      return getPayablesPeriodReport(context, filters);
    case "cash-flow-detailed":
      return getCashFlowDetailedReport(context, filters);
    case "result-by-development":
      return getResultByDevelopmentReport(context, filters);
    default:
      throw new Error("Relatório inválido.");
  }
}

async function getSalesMapReport(context: AccessContext, filters: ReportFilters): Promise<ReportResult> {
  const units = await prisma.unit.findMany({
    where: {
      isAccessory: false,
      development: {
        organizationId: context.organizationId,
        ...(filters.developmentId ? { id: filters.developmentId } : developmentAccessScope(context)),
      },
    },
    include: { development: true },
    orderBy: [{ development: { name: "asc" } }, { number: "asc" }],
  });

  return {
    title: "Mapa de vendas por empreendimento",
    columns: [
      { key: "development", label: "Empreendimento", type: "text" },
      { key: "unit", label: "Unidade", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "value", label: "Valor de referência", type: "currency" },
    ],
    rows: units.map((u) => ({
      development: u.development.name,
      unit: u.number,
      status: UNIT_STATUS_META[u.status as keyof typeof UNIT_STATUS_META]?.label ?? u.status,
      value: u.referenceValue ? Number(u.referenceValue) : 0,
    })),
  };
}

async function getSalesPeriodReport(context: AccessContext, filters: ReportFilters): Promise<ReportResult> {
  const sales = await prisma.sale.findMany({
    where: {
      organizationId: context.organizationId,
      status: "ACTIVE",
      ...(filters.dateFrom || filters.dateTo
        ? { saleDate: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
        : {}),
      ...(filters.developmentId ? { developmentId: filters.developmentId } : developmentAccessScope(context)),
    },
    include: {
      development: true,
      customer: true,
      unit: true,
      proposal: { include: { broker: true, agency: true, salesTable: true } },
    },
    orderBy: { saleDate: "desc" },
  });

  return {
    title: "Vendas por período",
    columns: [
      { key: "date", label: "Data", type: "date" },
      { key: "development", label: "Empreendimento", type: "text" },
      { key: "unit", label: "Unidade", type: "text" },
      { key: "customer", label: "Cliente", type: "text" },
      { key: "channel", label: "Canal", type: "text" },
      { key: "table", label: "Tabela", type: "text" },
      { key: "discount", label: "Desconto (%)", type: "percent" },
      { key: "value", label: "Valor", type: "currency" },
    ],
    rows: sales.map((s) => ({
      date: s.saleDate,
      development: s.development.name,
      unit: s.unit.number,
      customer: s.customer.name,
      channel: s.proposal?.agency?.name ?? s.proposal?.broker?.name ?? "—",
      table: s.proposal?.salesTable?.name ?? "—",
      discount: s.proposal ? Number(s.proposal.discountPercent) : 0,
      value: Number(s.salePrice),
    })),
  };
}

async function getProposalsPeriodReport(context: AccessContext, filters: ReportFilters): Promise<ReportResult> {
  const proposals = await prisma.proposal.findMany({
    where: {
      organizationId: context.organizationId,
      ...(filters.dateFrom || filters.dateTo
        ? { createdAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
        : {}),
      ...(filters.developmentId ? { developmentId: filters.developmentId } : developmentAccessScope(context)),
    },
    include: { development: true, customer: true, unit: true },
    orderBy: { createdAt: "desc" },
  });

  const STATUS_LABELS: Record<string, string> = {
    DRAFT: "Rascunho", PENDING_APPROVAL: "Em análise", APPROVED: "Aprovada",
    REJECTED: "Reprovada", CONVERTED: "Convertida em venda", CANCELLED: "Cancelada",
  };

  return {
    title: "Propostas do período",
    columns: [
      { key: "date", label: "Data", type: "date" },
      { key: "development", label: "Empreendimento", type: "text" },
      { key: "unit", label: "Unidade", type: "text" },
      { key: "customer", label: "Cliente", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "reason", label: "Motivo (se reprovada)", type: "text" },
      { key: "value", label: "Valor", type: "currency" },
    ],
    rows: proposals.map((p) => ({
      date: p.createdAt,
      development: p.development.name,
      unit: p.unit.number,
      customer: p.customer.name,
      status: STATUS_LABELS[p.status] ?? p.status,
      reason: p.status === "REJECTED" ? (p.evaluationReason ?? "—") : "—",
      value: Number(p.salePrice),
    })),
  };
}

async function getReservationsReport(context: AccessContext, filters: ReportFilters): Promise<ReportResult> {
  const reservations = await prisma.reservation.findMany({
    where: {
      organizationId: context.organizationId,
      unit: {
        development: {
          organizationId: context.organizationId,
          ...(filters.developmentId ? { id: filters.developmentId } : developmentAccessScope(context)),
        },
      },
      ...(filters.dateFrom || filters.dateTo
        ? { createdAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
        : {}),
    },
    include: { unit: { include: { development: true } }, customer: true, broker: true, agency: true },
    orderBy: { createdAt: "desc" },
  });

  const STATUS_LABELS: Record<string, string> = { ACTIVE: "Ativa", EXPIRED: "Expirada", CONVERTED: "Convertida", CANCELLED: "Cancelada" };

  return {
    title: "Reservas ativas e histórico",
    columns: [
      { key: "date", label: "Data", type: "date" },
      { key: "development", label: "Empreendimento", type: "text" },
      { key: "unit", label: "Unidade", type: "text" },
      { key: "customer", label: "Cliente", type: "text" },
      { key: "channel", label: "Canal", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "expiresAt", label: "Expira em", type: "date" },
    ],
    rows: reservations.map((r) => ({
      date: r.createdAt,
      development: r.unit.development.name,
      unit: r.unit.number,
      customer: r.customer.name,
      channel: r.agency?.name ?? r.broker?.name ?? "—",
      status: STATUS_LABELS[r.status] ?? r.status,
      expiresAt: r.expiresAt,
    })),
  };
}

async function getCommissionsReport(context: AccessContext, filters: ReportFilters): Promise<ReportResult> {
  const { splits } = await getCommissionStatement(context, { dateFrom: filters.dateFrom, dateTo: filters.dateTo });

  const BENEFICIARY_LABELS: Record<string, string> = { BROKER: "Corretor", AGENCY: "Imobiliária", COORDINATOR: "Coordenador", MANAGER: "Gerente", CAMPAIGN: "Campanha" };
  const STATUS_LABELS: Record<string, string> = { PENDING: "A liberar", RELEASED: "Liberada", INVOICED: "Faturada", PAID: "Paga", CANCELLED: "Cancelada" };

  return {
    title: "Comissões",
    columns: [
      { key: "sale", label: "Venda", type: "text" },
      { key: "development", label: "Empreendimento", type: "text" },
      { key: "customer", label: "Cliente", type: "text" },
      { key: "beneficiary", label: "Beneficiário", type: "text" },
      { key: "percent", label: "%", type: "percent" },
      { key: "value", label: "Valor", type: "currency" },
      { key: "status", label: "Status", type: "text" },
    ],
    rows: splits.map((s) => ({
      sale: s.sale.saleNumber,
      development: s.sale.development.name,
      customer: s.sale.customer.name,
      beneficiary: `${BENEFICIARY_LABELS[s.beneficiaryType] ?? s.beneficiaryType}${s.label ? ` (${s.label})` : ""}`,
      percent: Number(s.percent),
      value: Number(s.value),
      status: STATUS_LABELS[s.status] ?? s.status,
    })),
  };
}

async function getDistratosPeriodReport(context: AccessContext, filters: ReportFilters): Promise<ReportResult> {
  const distratos = await prisma.contractDistrato.findMany({
    where: {
      status: "SIGNED",
      ...(filters.dateFrom || filters.dateTo
        ? { signedAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
        : {}),
      contract: {
        organizationId: context.organizationId,
        ...(filters.developmentId ? { developmentId: filters.developmentId } : developmentAccessScope(context)),
      },
    },
    include: { contract: { include: { development: true, customer: true, unit: true } } },
    orderBy: { signedAt: "desc" },
  });

  return {
    title: "Distratos do período",
    columns: [
      { key: "date", label: "Data", type: "date" },
      { key: "development", label: "Empreendimento", type: "text" },
      { key: "unit", label: "Unidade", type: "text" },
      { key: "customer", label: "Cliente", type: "text" },
      { key: "totalPaid", label: "Total pago", type: "currency" },
      { key: "retention", label: "Retenção", type: "currency" },
      { key: "refund", label: "Devolução", type: "currency" },
    ],
    rows: distratos.map((d) => ({
      date: d.signedAt,
      development: d.contract.development.name,
      unit: d.contract.unit.number,
      customer: d.contract.customer.name,
      totalPaid: Number(d.totalPaid),
      retention: Number(d.retentionAmount),
      refund: Number(d.refundAmount),
    })),
  };
}

async function getPortfolioPositionReport(context: AccessContext, filters: ReportFilters): Promise<ReportResult> {
  const developments = filters.developmentId
    ? [await prisma.development.findUniqueOrThrow({ where: { id: filters.developmentId } })]
    : await listDevelopments(context);

  const rows = await Promise.all(
    developments.map(async (dev) => {
      const summary = await getReceivablesSummary(context.organizationId, dev.id);
      return {
        development: dev.name,
        totalReceived: summary.totalReceived,
        totalOutstanding: summary.totalOutstanding,
        overdueAmount: summary.overdueAmount,
        overdueCount: summary.overdueCount,
      };
    }),
  );

  return {
    title: "Posição da carteira",
    columns: [
      { key: "development", label: "Empreendimento", type: "text" },
      { key: "totalReceived", label: "Recebido", type: "currency" },
      { key: "totalOutstanding", label: "Em aberto", type: "currency" },
      { key: "overdueAmount", label: "Vencido", type: "currency" },
      { key: "overdueCount", label: "Parcelas vencidas", type: "number" },
    ],
    rows,
  };
}

async function getReceiptsPeriodReport(context: AccessContext, filters: ReportFilters): Promise<ReportResult> {
  const contractScope = filters.developmentId ? { developmentId: filters.developmentId } : developmentAccessScope(context);
  const payments = await prisma.installmentPayment.findMany({
    where: {
      ...(filters.dateFrom || filters.dateTo
        ? { paidAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
        : {}),
      installment: { portfolio: { organizationId: context.organizationId, contract: contractScope } },
    },
    include: {
      installment: { include: { portfolio: { include: { contract: { include: { development: true, customer: true } } } } } },
    },
    orderBy: { paidAt: "desc" },
  });

  return {
    title: "Extrato consolidado de recebimentos",
    columns: [
      { key: "date", label: "Data", type: "date" },
      { key: "development", label: "Empreendimento", type: "text" },
      { key: "customer", label: "Cliente", type: "text" },
      { key: "installment", label: "Parcela", type: "text" },
      { key: "amount", label: "Valor", type: "currency" },
      { key: "method", label: "Forma", type: "text" },
    ],
    rows: payments.map((p) => ({
      date: p.paidAt,
      development: p.installment.portfolio.contract.development.name,
      customer: p.installment.portfolio.contract.customer.name,
      installment: p.installment.label,
      amount: Number(p.amount),
      method: p.method ?? "—",
    })),
  };
}

async function getOverdueDetailedReport(context: AccessContext, filters: ReportFilters): Promise<ReportResult> {
  const [aging, stages] = await Promise.all([
    getPortfolioAging(context, filters.developmentId ? { developmentId: filters.developmentId } : {}),
    getOverdueCustomerStages(context),
  ]);
  const stageByCustomer = new Map(stages.map((s) => [s.customerId, s]));

  return {
    title: "Inadimplência detalhada",
    columns: [
      { key: "customer", label: "Cliente", type: "text" },
      { key: "development", label: "Empreendimento", type: "text" },
      { key: "contract", label: "Contrato", type: "text" },
      { key: "installment", label: "Parcela", type: "text" },
      { key: "dueDate", label: "Vencimento", type: "date" },
      { key: "daysOverdue", label: "Dias em atraso", type: "number" },
      { key: "value", label: "Valor", type: "currency" },
      { key: "stage", label: "Etapa da régua", type: "text" },
    ],
    rows: aging.rows.map((r) => ({
      customer: r.customerName,
      development: r.developmentName,
      contract: r.contractNumber,
      installment: r.label,
      dueDate: r.dueDate,
      daysOverdue: r.daysOverdue,
      value: r.resultValue,
      stage: stageByCustomer.get(r.customerId)?.currentStep?.actionLabel ?? "—",
    })),
  };
}

async function getRenegotiationsReport(context: AccessContext, filters: ReportFilters): Promise<ReportResult> {
  const agreements = await prisma.renegotiationAgreement.findMany({
    where: {
      ...(filters.dateFrom || filters.dateTo
        ? { agreementDate: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
        : {}),
      contract: {
        organizationId: context.organizationId,
        ...(filters.developmentId ? { developmentId: filters.developmentId } : developmentAccessScope(context)),
      },
    },
    include: { contract: { include: { development: true, customer: true } } },
    orderBy: { agreementDate: "desc" },
  });

  const STATUS_LABELS: Record<string, string> = { DRAFT: "Rascunho", PENDING_APPROVAL: "Em aprovação", SIGNED: "Cumprida", BROKEN: "Descumprida", REJECTED: "Rejeitada" };

  return {
    title: "Renegociações",
    columns: [
      { key: "date", label: "Data do acordo", type: "date" },
      { key: "development", label: "Empreendimento", type: "text" },
      { key: "customer", label: "Cliente", type: "text" },
      { key: "finalValue", label: "Valor final", type: "currency" },
      { key: "status", label: "Status", type: "text" },
    ],
    rows: agreements.map((a) => ({
      date: a.agreementDate,
      development: a.contract.development.name,
      customer: a.contract.customer.name,
      finalValue: Number(a.finalValue),
      status: STATUS_LABELS[a.status] ?? a.status,
    })),
  };
}

async function getPayablesPeriodReport(context: AccessContext, filters: ReportFilters): Promise<ReportResult> {
  const payables = await listPayablesForExport(context, {
    developmentId: filters.developmentId,
    dueDateFrom: filters.dateFrom,
    dueDateTo: filters.dateTo,
  });

  const STATUS_LABELS: Record<string, string> = {
    ENTERED: "Lançada", REVIEWED: "Conferida", APPROVED: "Aprovada", SCHEDULED: "Programada", PAID: "Paga", RECONCILED: "Conciliada", CANCELLED: "Cancelada",
  };

  return {
    title: "Contas a pagar",
    columns: [
      { key: "dueDate", label: "Vencimento", type: "date" },
      { key: "description", label: "Descrição", type: "text" },
      { key: "supplier", label: "Fornecedor", type: "text" },
      { key: "development", label: "Empreendimento", type: "text" },
      { key: "costCenter", label: "Centro de custo", type: "text" },
      { key: "amount", label: "Valor", type: "currency" },
      { key: "status", label: "Status", type: "text" },
    ],
    rows: payables.map((p) => ({
      dueDate: p.dueDate,
      description: p.description,
      supplier: p.supplier?.name ?? "—",
      development: p.development?.name ?? "Organização",
      costCenter: p.costCenter?.name ?? "—",
      amount: Number(p.amount),
      status: STATUS_LABELS[p.status] ?? p.status,
    })),
  };
}

async function getCashFlowDetailedReport(context: AccessContext, filters: ReportFilters): Promise<ReportResult> {
  const buckets = await getCashFlow(context, {
    developmentId: filters.developmentId,
    granularity: "weekly",
    daysBack: filters.dateFrom ? Math.round((Date.now() - filters.dateFrom.getTime()) / 86400000) : undefined,
    daysForward: filters.dateTo ? Math.round((filters.dateTo.getTime() - Date.now()) / 86400000) : undefined,
  });

  return {
    title: "Fluxo de caixa detalhado (previsto × realizado)",
    columns: [
      { key: "period", label: "Semana", type: "text" },
      { key: "receivablesForecast", label: "A receber (previsto)", type: "currency" },
      { key: "receivablesRealized", label: "Recebido", type: "currency" },
      { key: "payablesForecast", label: "A pagar (previsto)", type: "currency" },
      { key: "payablesRealized", label: "Pago", type: "currency" },
      { key: "netRealized", label: "Saldo do período", type: "currency" },
      { key: "cumulativeRealized", label: "Saldo acumulado", type: "currency" },
    ],
    rows: buckets.map((b) => ({
      period: b.period,
      receivablesForecast: b.receivablesForecast,
      receivablesRealized: b.receivablesRealized,
      payablesForecast: b.payablesForecast,
      payablesRealized: b.payablesRealized,
      netRealized: b.netRealized,
      cumulativeRealized: b.cumulativeRealized,
    })),
  };
}

async function getResultByDevelopmentReport(context: AccessContext, filters: ReportFilters): Promise<ReportResult> {
  const developments = filters.developmentId
    ? [await prisma.development.findUniqueOrThrow({ where: { id: filters.developmentId } })]
    : await listDevelopments(context);

  const rows = await Promise.all(
    developments.map(async (dev) => {
      const buckets = await getCashFlow(context, {
        developmentId: dev.id,
        granularity: "monthly",
        monthsBack: 12,
        monthsForward: 0,
        includeOpeningBalance: false,
      });
      const inRange = buckets.filter((b) => {
        if (!filters.dateFrom && !filters.dateTo) return true;
        const [year, month] = b.period.split("-").map(Number);
        const bucketStart = new Date(year, month - 1, 1);
        const bucketEnd = new Date(year, month, 0, 23, 59, 59, 999);
        return (!filters.dateFrom || bucketEnd >= filters.dateFrom) && (!filters.dateTo || bucketStart <= filters.dateTo);
      });
      const receita = round2(inRange.reduce((sum, b) => sum + b.receivablesRealized, 0));
      const despesa = round2(inRange.reduce((sum, b) => sum + b.payablesRealized, 0));
      return { development: dev.name, receita, despesa, resultado: round2(receita - despesa) };
    }),
  );

  return {
    title: "Resultado por empreendimento (regime caixa)",
    columns: [
      { key: "development", label: "Empreendimento", type: "text" },
      { key: "receita", label: "Receita recebida", type: "currency" },
      { key: "despesa", label: "Despesa paga", type: "currency" },
      { key: "resultado", label: "Resultado", type: "currency" },
    ],
    rows,
  };
}
