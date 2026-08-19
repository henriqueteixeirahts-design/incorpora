import { type NextRequest, NextResponse } from "next/server";
import { requireAccessContext } from "@/server/auth-context";
import { listPayablesForExport } from "@/server/payables";
import type { PayableCategory, PayableStatus } from "@/generated/prisma/client";
import { formatCalendarDateBR } from "@/lib/format";

const STATUS_LABELS: Record<string, string> = {
  ENTERED: "Lançada",
  REVIEWED: "Conferida",
  APPROVED: "Aprovada",
  SCHEDULED: "Programada",
  PAID: "Paga",
  RECONCILED: "Conciliada",
  CANCELLED: "Cancelada",
};

function csvEscape(value: string) {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Exportação da lista de contas a pagar (Fase B, Parte 4.1) — mesmos filtros da tela, sem paginação. */
export async function GET(request: NextRequest) {
  const context = await requireAccessContext();
  const params = request.nextUrl.searchParams;

  const items = await listPayablesForExport(context.organizationId, {
    search: params.get("q") ?? undefined,
    developmentId: params.get("developmentId") ?? undefined,
    speId: params.get("speId") ?? undefined,
    supplierId: params.get("supplierId") ?? undefined,
    costCenterId: params.get("costCenterId") ?? undefined,
    category: (params.get("category") as PayableCategory) || undefined,
    status: (params.get("status") as PayableStatus) || undefined,
    dueDateFrom: params.get("dueDateFrom") ? new Date(params.get("dueDateFrom")!) : undefined,
    dueDateTo: params.get("dueDateTo") ? new Date(params.get("dueDateTo")!) : undefined,
    minAmount: params.get("minAmount") ? Number(params.get("minAmount")) : undefined,
    maxAmount: params.get("maxAmount") ? Number(params.get("maxAmount")) : undefined,
    pendingApprovalOnly: params.get("pending") === "1",
  });

  const header = [
    "Descrição",
    "Categoria",
    "Empreendimento",
    "SPE",
    "Fornecedor",
    "Centro de custo",
    "Competência",
    "Vencimento",
    "Valor",
    "Status",
    "Documento fiscal",
    "Rateio",
  ];

  const rows = items.map((payable) => [
    payable.description,
    payable.category,
    payable.development?.name ?? "Organização",
    payable.spe?.name ?? "",
    payable.supplier?.name ?? "",
    payable.costCenter?.name ?? "",
    formatCalendarDateBR(payable.competenceDate),
    formatCalendarDateBR(payable.dueDate),
    Number(payable.amount).toFixed(2).replace(".", ","),
    STATUS_LABELS[payable.status] ?? payable.status,
    payable.fiscalDocument ?? "",
    payable.allocations.length > 0
      ? payable.allocations
          .map((a) => `${a.development?.name ?? "Organização"}: ${Number(a.amount).toFixed(2).replace(".", ",")}`)
          .join(" | ")
      : "",
  ]);

  const csv = [header, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(";")).join("\n");
  const csvWithBom = "﻿" + csv;

  return new NextResponse(csvWithBom, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contas-a-pagar-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
