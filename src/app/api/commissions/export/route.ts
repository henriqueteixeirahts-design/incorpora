import { type NextRequest, NextResponse } from "next/server";
import { requireAccessContext } from "@/server/auth-context";
import { getCommissionStatement } from "@/server/commissions";

const BENEFICIARY_LABELS: Record<string, string> = {
  BROKER: "Corretor",
  AGENCY: "Imobiliária",
  COORDINATOR: "Coordenador",
  MANAGER: "Gerente",
  CAMPAIGN: "Campanha",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "A liberar",
  RELEASED: "Liberada",
  INVOICED: "Faturada",
  PAID: "Paga",
  CANCELLED: "Cancelada",
};

function csvEscape(value: string) {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Extrato de comissões (Fase A, Parte 4.2) — mesmos filtros da tela, sem paginação. */
export async function GET(request: NextRequest) {
  const context = await requireAccessContext();
  const params = request.nextUrl.searchParams;

  const { splits } = await getCommissionStatement(context.organizationId, {
    brokerId: params.get("brokerId") ?? undefined,
    agencyId: params.get("agencyId") ?? undefined,
    dateFrom: params.get("dateFrom") ? new Date(params.get("dateFrom")!) : undefined,
    dateTo: params.get("dateTo") ? new Date(params.get("dateTo")!) : undefined,
  });

  const header = ["Venda", "Empreendimento", "Cliente", "Beneficiário", "%", "Valor", "Status"];

  const rows = splits.map((split) => [
    split.sale.saleNumber,
    split.sale.development.name,
    split.sale.customer.name,
    `${BENEFICIARY_LABELS[split.beneficiaryType] ?? split.beneficiaryType}${split.label ? ` (${split.label})` : ""}`,
    Number(split.percent).toString(),
    Number(split.value).toFixed(2).replace(".", ","),
    STATUS_LABELS[split.status] ?? split.status,
  ]);

  const csv = [header, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(";")).join("\n");
  const csvWithBom = "﻿" + csv;

  return new NextResponse(csvWithBom, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="comissoes-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
