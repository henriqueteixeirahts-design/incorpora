import { type NextRequest, NextResponse } from "next/server";
import { requireAccessContext } from "@/server/auth-context";
import {
  listSalesPaged,
  walletStatusFromInstallments,
  type ContractStatusFilter,
  type WalletStatusFilter,
} from "@/server/sales";

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Minuta gerada",
  AWAITING_SIGNATURE: "Aguardando assinatura",
  SIGNED: "Assinado",
  CANCELLED: "Cancelado",
};

function csvEscape(value: string) {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Exportação da lista de vendas (Fase A, Parte 3.1) — mesmos filtros da tela, sem paginação. */
export async function GET(request: NextRequest) {
  const context = await requireAccessContext();
  const params = request.nextUrl.searchParams;

  const { items } = await listSalesPaged(context.organizationId, {
    search: params.get("q") ?? undefined,
    contractStatus: (params.get("contractStatus") as ContractStatusFilter) || undefined,
    brokerId: params.get("brokerId") ?? undefined,
    agencyId: params.get("agencyId") ?? undefined,
    dateFrom: params.get("dateFrom") ? new Date(params.get("dateFrom")!) : undefined,
    dateTo: params.get("dateTo") ? new Date(params.get("dateTo")!) : undefined,
    walletStatus: (params.get("walletStatus") as WalletStatusFilter) || undefined,
    pageSize: 100000,
  });

  const header = [
    "Nº da venda",
    "Data",
    "Cliente",
    "Empreendimento",
    "Unidade",
    "Valor",
    "Status do contrato",
    "Status da carteira",
    "Corretor",
    "Imobiliária",
  ];

  const rows = items.map((sale) => [
    sale.saleNumber,
    new Date(sale.saleDate).toLocaleDateString("pt-BR"),
    sale.customer.name,
    sale.development.name,
    sale.unit.number,
    Number(sale.salePrice).toFixed(2).replace(".", ","),
    sale.contract ? (CONTRACT_STATUS_LABELS[sale.contract.status] ?? sale.contract.status) : "Sem contrato",
    walletStatusFromInstallments(sale.contract?.portfolio?.installments) === "INADIMPLENTE"
      ? "Inadimplente"
      : walletStatusFromInstallments(sale.contract?.portfolio?.installments) === "EM_DIA"
        ? "Em dia"
        : "—",
    sale.proposal.broker?.name ?? "",
    sale.proposal.agency?.name ?? "",
  ]);

  const csv = [header, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(";")).join("\n");
  const csvWithBom = "﻿" + csv;

  return new NextResponse(csvWithBom, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vendas-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
