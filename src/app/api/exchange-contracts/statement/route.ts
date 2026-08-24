import { type NextRequest, NextResponse } from "next/server";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getExchangeStatement } from "@/server/exchange-statement";
import { renderInvestorStatementPdf, type InvestorStatementEventRow } from "@/lib/document-pdf";
import { formatCurrencyBRL as formatCurrency, formatCalendarDateBR, formatDateTimeBR } from "@/lib/format";

const TYPE_LABELS: Record<string, string> = {
  PHYSICAL: "Física",
  FINANCIAL: "Financeira",
  MIXED: "Mista",
};

const EVENT_KIND_LABELS: Record<string, string> = {
  REPASSE: "Repasse",
  PERIOD_CLOSED: "Fechamento de período",
  RETENTION_RELEASE: "Liberação de retenção",
};

/** Extrato do permutante em PDF (docs/ESPEC_PERMUTANTES.md, Etapa 5). */
export async function GET(request: NextRequest) {
  const context = await requireAccessContext();
  if (!hasPermission(context, "exchange_contract", "VIEW")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const exchangeContractId = request.nextUrl.searchParams.get("exchangeContractId");
  if (!exchangeContractId) return NextResponse.json({ error: "Informe o contrato de permuta." }, { status: 400 });

  let statement;
  try {
    statement = await getExchangeStatement(context, exchangeContractId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Contrato inválido." }, { status: 400 });
  }

  const summary = [
    { label: "Empreendimento", valueLabel: statement.contract.developmentName },
    { label: "Total recebido (base)", valueLabel: formatCurrency(statement.summary.totalGrossBase) },
    { label: "Taxa de administração", valueLabel: formatCurrency(statement.summary.totalAdministrationFee) },
  ];
  if (statement.contract.type !== "FINANCIAL") {
    summary.push(
      { label: "Corretagem externa", valueLabel: formatCurrency(statement.summary.totalExternalCommission) },
      { label: "Corretagem interna", valueLabel: formatCurrency(statement.summary.totalInternalCommission) },
    );
  }
  summary.push(
    { label: "Total repassado", valueLabel: formatCurrency(statement.summary.totalRepassed) },
    { label: "Saldo retido", valueLabel: formatCurrency(statement.summary.retentionBalance) },
  );

  const events: InvestorStatementEventRow[] = statement.events.map((e) => ({
    dateLabel: formatCalendarDateBR(e.date),
    kindLabel: EVENT_KIND_LABELS[e.kind] ?? e.kind,
    label: e.label,
    amountLabel: formatCurrency(e.amount),
    statusLabel: e.statusLabel,
  }));

  const pdfBuffer = await renderInvestorStatementPdf({
    title: `Extrato do permutante — ${statement.contract.permutanteName}`,
    subtitle: `Permuta ${TYPE_LABELS[statement.contract.type] ?? statement.contract.type} — documento ${statement.contract.permutanteDocument}`,
    summary,
    events,
    footer: `Extrato do permutante — gerado em ${formatDateTimeBR(new Date())}`,
  });

  const fileName = `extrato-permutante-${statement.contract.permutanteName.replace(/[^a-zA-Z0-9]+/g, "-")}-${Date.now()}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
