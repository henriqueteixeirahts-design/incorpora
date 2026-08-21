import { type NextRequest, NextResponse } from "next/server";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getInvestorStatement } from "@/server/spe-investor-statement";
import { renderInvestorStatementPdf, type InvestorStatementEventRow } from "@/lib/document-pdf";
import { formatCurrencyBRL as formatCurrency, formatCalendarDateBR, formatDateTimeBR } from "@/lib/format";

const MODALITY_LABELS: Record<string, string> = {
  EQUITY: "Equity",
  LOAN: "Mútuo",
  PHYSICAL_EXCHANGE: "Permuta física",
  FINANCIAL_EXCHANGE: "Permuta financeira",
  OTHER: "Outra",
};

const EVENT_KIND_LABELS: Record<string, string> = {
  FORECAST: "Previsão",
  CAPITAL_CALL: "Chamada de capital",
  CONTRIBUTION: "Aporte",
  RETURN: "Devolução/distribuição",
};

/** Extrato do investidor em PDF (docs/ESPEC_APORTES_INVESTIDORES.md, Parte 4). */
export async function GET(request: NextRequest) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "spe", "VIEW")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const investorId = request.nextUrl.searchParams.get("investorId");
  if (!investorId) return NextResponse.json({ error: "Informe o investidor." }, { status: 400 });

  let statement;
  try {
    statement = await getInvestorStatement(context, investorId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Investidor inválido." }, { status: 400 });
  }

  const summary = [
    { label: "Capital comprometido", valueLabel: statement.summary.committed !== null ? formatCurrency(statement.summary.committed) : "Sem teto" },
    { label: "Total aportado", valueLabel: formatCurrency(statement.summary.totalContributed) },
    { label: "Total devolvido/distribuído", valueLabel: formatCurrency(statement.summary.totalReturned) },
    { label: "Posição líquida", valueLabel: formatCurrency(statement.summary.netPosition) },
  ];
  if (statement.summary.loanPosition) {
    summary.push({ label: "Saldo devedor do mútuo", valueLabel: formatCurrency(statement.summary.loanPosition.netBalance) });
  }

  const events: InvestorStatementEventRow[] = statement.events.map((e) => ({
    dateLabel: formatCalendarDateBR(e.date),
    kindLabel: EVENT_KIND_LABELS[e.kind] ?? e.kind,
    label: e.label,
    amountLabel: formatCurrency(e.amount),
    statusLabel: e.statusLabel,
  }));

  const pdfBuffer = await renderInvestorStatementPdf({
    title: `Extrato do investidor — ${statement.investor.name}`,
    subtitle: `${MODALITY_LABELS[statement.investor.modality] ?? statement.investor.modality} — documento ${statement.investor.document}`,
    summary,
    events,
    footer: `Extrato do investidor — gerado em ${formatDateTimeBR(new Date())}`,
  });

  const fileName = `extrato-investidor-${statement.investor.name.replace(/[^a-zA-Z0-9]+/g, "-")}-${Date.now()}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
