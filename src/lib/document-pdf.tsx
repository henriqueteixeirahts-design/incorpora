// Renderização do PDF do documento gerado (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md,
// Parte 1.4). Usa @react-pdf/renderer — roda em Node puro (pdfkit por baixo),
// sem navegador headless, compatível com função serverless de curta duração
// (não há orçamento de memória/tempo pra Puppeteer no plano Hobby da Vercel,
// mesma restrição já documentada pros cron slots).

import { Document, Page, StyleSheet, Text, renderToBuffer } from "@react-pdf/renderer";

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
