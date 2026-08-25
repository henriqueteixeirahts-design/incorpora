// Renderização do PDF do documento gerado (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md,
// Parte 1.4). Usa @react-pdf/renderer — roda em Node puro (pdfkit por baixo),
// sem navegador headless, compatível com função serverless de curta duração
// (não há orçamento de memória/tempo pra Puppeteer no plano Hobby da Vercel,
// mesma restrição já documentada pros cron slots).

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, lineHeight: 1.5 },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 16, textAlign: "center" },
  paragraph: { marginBottom: 10 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: "#666666" },
});

/** Divide o texto resolvido em parágrafos (separados por linha em branco). */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export async function renderDocumentPdf(params: {
  title: string;
  text: string;
  footer: string;
}): Promise<Buffer> {
  const paragraphs = splitParagraphs(params.text);

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{params.title}</Text>
        {paragraphs.map((paragraph, index) => (
          <Text key={index} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}
        <Text style={styles.footer} fixed>
          {params.footer}
        </Text>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}

const statementStyles = StyleSheet.create({
  contractHeader: { fontSize: 12, fontWeight: 700, marginTop: 18, marginBottom: 4 },
  contractSubtitle: { fontSize: 9, color: "#444444", marginBottom: 8 },
  summaryRow: { flexDirection: "row", marginBottom: 2 },
  summaryLabel: { width: 140, fontSize: 9, color: "#444444" },
  summaryValue: { fontSize: 9, fontWeight: 700 },
  table: { marginTop: 8, borderTop: 1, borderColor: "#cccccc" },
  tableHeaderRow: { flexDirection: "row", borderBottom: 1, borderColor: "#999999", paddingVertical: 3, backgroundColor: "#f2f2f2" },
  tableRow: { flexDirection: "row", borderBottom: 1, borderColor: "#eeeeee", paddingVertical: 3 },
  colLabel: { width: "22%", fontSize: 8, paddingRight: 4 },
  colDate: { width: "13%", fontSize: 8 },
  colValue: { width: "15%", fontSize: 8, textAlign: "right", paddingRight: 4 },
  colStatus: { width: "15%", fontSize: 8 },
  colPayment: { width: "20%", fontSize: 8 },
  headerCell: { fontSize: 8, fontWeight: 700 },
});

export type StatementInstallmentRow = {
  label: string;
  dueDateLabel: string;
  originalValueLabel: string;
  correctedValueLabel: string;
  situationLabel: string;
  paymentLabel: string;
};

export type StatementContractSection = {
  contractNumber: string;
  developmentUnit: string;
  situationLabel: string;
  contractedValueLabel: string;
  totalPaidLabel: string;
  outstandingBalanceLabel: string;
  percentPaidLabel: string;
  installments: StatementInstallmentRow[];
};

/**
 * PDF do extrato do cliente (Fase B, Parte 1.2) — diferente de
 * `renderDocumentPdf` (texto corrido só, pensado pra contratos/aditivos),
 * o extrato precisa de uma tabela de parcelas de verdade. `@react-pdf/renderer`
 * já suporta `View`/flexbox pra isso — só não era usado ainda. `headerText`
 * passa pelo mesmo motor de variáveis/templates da Fase A (contratante,
 * texto de abertura configurável), a tabela em si é sempre estruturada.
 */
export async function renderStatementPdf(params: {
  title: string;
  headerText: string;
  footer: string;
  contracts: StatementContractSection[];
}): Promise<Buffer> {
  const headerParagraphs = splitParagraphs(params.headerText);

  const doc = (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>{params.title}</Text>
        {headerParagraphs.map((paragraph, index) => (
          <Text key={index} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}

        {params.contracts.map((section, sectionIndex) => (
          <View key={sectionIndex} wrap={false}>
            <Text style={statementStyles.contractHeader}>{section.contractNumber}</Text>
            <Text style={statementStyles.contractSubtitle}>
              {section.developmentUnit} — {section.situationLabel}
            </Text>

            <View style={statementStyles.summaryRow}>
              <Text style={statementStyles.summaryLabel}>Valor contratado</Text>
              <Text style={statementStyles.summaryValue}>{section.contractedValueLabel}</Text>
            </View>
            <View style={statementStyles.summaryRow}>
              <Text style={statementStyles.summaryLabel}>Total pago</Text>
              <Text style={statementStyles.summaryValue}>{section.totalPaidLabel}</Text>
            </View>
            <View style={statementStyles.summaryRow}>
              <Text style={statementStyles.summaryLabel}>Saldo devedor atual</Text>
              <Text style={statementStyles.summaryValue}>{section.outstandingBalanceLabel}</Text>
            </View>
            <View style={statementStyles.summaryRow}>
              <Text style={statementStyles.summaryLabel}>% quitado</Text>
              <Text style={statementStyles.summaryValue}>{section.percentPaidLabel}</Text>
            </View>

            <View style={statementStyles.table}>
              <View style={statementStyles.tableHeaderRow}>
                <Text style={[statementStyles.colLabel, statementStyles.headerCell]}>Parcela</Text>
                <Text style={[statementStyles.colDate, statementStyles.headerCell]}>Vencimento</Text>
                <Text style={[statementStyles.colValue, statementStyles.headerCell]}>Original</Text>
                <Text style={[statementStyles.colValue, statementStyles.headerCell]}>Corrigido</Text>
                <Text style={[statementStyles.colStatus, statementStyles.headerCell]}>Situação</Text>
                <Text style={[statementStyles.colPayment, statementStyles.headerCell]}>Pagamento</Text>
              </View>
              {section.installments.map((installment, index) => (
                <View key={index} style={statementStyles.tableRow} wrap={false}>
                  <Text style={statementStyles.colLabel}>{installment.label}</Text>
                  <Text style={statementStyles.colDate}>{installment.dueDateLabel}</Text>
                  <Text style={statementStyles.colValue}>{installment.originalValueLabel}</Text>
                  <Text style={statementStyles.colValue}>{installment.correctedValueLabel}</Text>
                  <Text style={statementStyles.colStatus}>{installment.situationLabel}</Text>
                  <Text style={statementStyles.colPayment}>{installment.paymentLabel}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.footer} fixed>
          {params.footer}
        </Text>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}

const genericTableStyles = StyleSheet.create({
  meta: { fontSize: 8, color: "#666666", marginBottom: 10 },
  table: { marginTop: 4, borderTop: 1, borderColor: "#cccccc" },
  headerRow: { flexDirection: "row", borderBottom: 1, borderColor: "#999999", paddingVertical: 3, backgroundColor: "#f2f2f2" },
  row: { flexDirection: "row", borderBottom: 1, borderColor: "#eeeeee", paddingVertical: 3 },
  cell: { fontSize: 7.5, paddingRight: 4 },
  headerCell: { fontSize: 7.5, fontWeight: 700, paddingRight: 4 },
});

export type GenericReportColumn = { label: string; align?: "left" | "right" };
export type GenericReportRow = string[];

/**
 * PDF genérico pra Central de Relatórios (docs/ESPEC_FASE_C_DASHBOARD_
 * EMPREENDIMENTOS.md, Etapa 5) — sem motor de templates (relatório não é um
 * documento vinculado a um Contract, mesma limitação já registrada pro
 * extrato do investidor/permutante e pro contrato de parceria). Cabeçalho
 * fixo com nome do relatório, data de emissão e filtros aplicados — cobre a
 * exigência da spec ("cabeçalho com logo TSH, data de emissão, filtros
 * aplicados") na parte estrutural; o logo em si fica pra uma passada futura
 * de identidade visual do PDF.
 */
export async function renderGenericReportPdf(params: {
  title: string;
  filtersLabel: string;
  columns: GenericReportColumn[];
  rows: GenericReportRow[];
  footer: string;
}): Promise<Buffer> {
  const colWidth = `${Math.floor(100 / Math.max(1, params.columns.length))}%`;

  const doc = (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <Text style={styles.title}>{params.title}</Text>
        <Text style={genericTableStyles.meta}>{params.filtersLabel}</Text>

        <View style={genericTableStyles.table}>
          <View style={genericTableStyles.headerRow} fixed>
            {params.columns.map((col, i) => (
              <Text key={i} style={[genericTableStyles.headerCell, { width: colWidth, textAlign: col.align ?? "left" }]}>
                {col.label}
              </Text>
            ))}
          </View>
          {params.rows.map((row, rowIndex) => (
            <View key={rowIndex} style={genericTableStyles.row} wrap={false}>
              {row.map((cell, cellIndex) => (
                <Text
                  key={cellIndex}
                  style={[genericTableStyles.cell, { width: colWidth, textAlign: params.columns[cellIndex]?.align ?? "left" }]}
                >
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <Text style={styles.footer} fixed>
          {params.footer}
        </Text>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}

export type InvestorStatementSummaryRow = { label: string; valueLabel: string };
export type InvestorStatementEventRow = {
  dateLabel: string;
  kindLabel: string;
  label: string;
  amountLabel: string;
  statusLabel: string;
};

/**
 * PDF do extrato do investidor (docs/ESPEC_APORTES_INVESTIDORES.md, Parte 4)
 * — sem motor de templates (esse não é um documento vinculado a um Contract,
 * mesma limitação já registrada pro contrato de parceria e pra chamada de
 * capital): título e rótulos fixos em português, sem texto configurável.
 */
export async function renderInvestorStatementPdf(params: {
  title: string;
  subtitle: string;
  summary: InvestorStatementSummaryRow[];
  events: InvestorStatementEventRow[];
  footer: string;
}): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>{params.title}</Text>
        <Text style={statementStyles.contractSubtitle}>{params.subtitle}</Text>

        {params.summary.map((row, index) => (
          <View key={index} style={statementStyles.summaryRow}>
            <Text style={statementStyles.summaryLabel}>{row.label}</Text>
            <Text style={statementStyles.summaryValue}>{row.valueLabel}</Text>
          </View>
        ))}

        <View style={statementStyles.table}>
          <View style={statementStyles.tableHeaderRow}>
            <Text style={[statementStyles.colDate, statementStyles.headerCell]}>Data</Text>
            <Text style={[statementStyles.colStatus, statementStyles.headerCell]}>Tipo</Text>
            <Text style={[statementStyles.colLabel, statementStyles.headerCell]}>Descrição</Text>
            <Text style={[statementStyles.colValue, statementStyles.headerCell]}>Valor</Text>
            <Text style={[statementStyles.colStatus, statementStyles.headerCell]}>Status</Text>
          </View>
          {params.events.map((event, index) => (
            <View key={index} style={statementStyles.tableRow} wrap={false}>
              <Text style={statementStyles.colDate}>{event.dateLabel}</Text>
              <Text style={statementStyles.colStatus}>{event.kindLabel}</Text>
              <Text style={statementStyles.colLabel}>{event.label}</Text>
              <Text style={statementStyles.colValue}>{event.amountLabel}</Text>
              <Text style={statementStyles.colStatus}>{event.statusLabel}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer} fixed>
          {params.footer}
        </Text>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
