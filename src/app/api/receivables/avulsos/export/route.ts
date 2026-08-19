import { type NextRequest, NextResponse } from "next/server";
import { requireAccessContext } from "@/server/auth-context";
import { listReceivablesForExport } from "@/server/receivables-avulsos";
import type { ReceivableCategory, ReceivableStatus } from "@/generated/prisma/client";
import { formatCalendarDateBR } from "@/lib/format";

const CATEGORY_LABELS: Record<string, string> = {
  ASSIGNMENT_FEE: "Taxa de cessão",
  SPACE_RENTAL: "Aluguel de espaço",
  REFUND: "Reembolso",
  YIELD: "Rendimento",
  OTHER: "Outro",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  RECEIVED: "Recebido",
  CANCELLED: "Cancelado",
};

function csvEscape(value: string) {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Exportação da lista de recebíveis avulsos (Fase B, Parte 4.3) — mesmos filtros da tela, sem paginação. */
export async function GET(request: NextRequest) {
  const context = await requireAccessContext();
  const params = request.nextUrl.searchParams;

  const items = await listReceivablesForExport(context.organizationId, {
    search: params.get("q") ?? undefined,
    developmentId: params.get("developmentId") ?? undefined,
    speId: params.get("speId") ?? undefined,
    customerId: params.get("customerId") ?? undefined,
    category: (params.get("category") as ReceivableCategory) || undefined,
    status: (params.get("status") as ReceivableStatus) || undefined,
    dueDateFrom: params.get("dueDateFrom") ? new Date(params.get("dueDateFrom")!) : undefined,
    dueDateTo: params.get("dueDateTo") ? new Date(params.get("dueDateTo")!) : undefined,
    minAmount: params.get("minAmount") ? Number(params.get("minAmount")) : undefined,
    maxAmount: params.get("maxAmount") ? Number(params.get("maxAmount")) : undefined,
  });

  const header = ["Origem", "Categoria", "Cliente/pagador", "Empreendimento", "SPE", "Vencimento", "Valor", "Status", "Recebido em", "Valor recebido"];

  const rows = items.map((r) => [
    r.origin,
    CATEGORY_LABELS[r.category] ?? r.category,
    r.customer?.name ?? "",
    r.development?.name ?? "Organização",
    r.spe?.name ?? "",
    formatCalendarDateBR(r.dueDate),
    Number(r.amount).toFixed(2).replace(".", ","),
    STATUS_LABELS[r.status] ?? r.status,
    r.receivedAt ? formatCalendarDateBR(r.receivedAt) : "",
    r.receivedAmount ? Number(r.receivedAmount).toFixed(2).replace(".", ",") : "",
  ]);

  const csv = [header, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(";")).join("\n");
  const csvWithBom = "﻿" + csv;

  return new NextResponse(csvWithBom, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="recebiveis-avulsos-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
