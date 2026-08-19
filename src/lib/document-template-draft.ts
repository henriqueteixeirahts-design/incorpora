/**
 * Marca de "rascunho" nos modelos de documento seedados automaticamente
 * (docs/RELATORIO_TESTDRIVE.md, achado 21) — não são um campo de banco
 * novo, só uma convenção no nome (decisão do PO: nascem ativos, mas
 * sinalizados). `isDraftTemplateName` é o único lugar que reconhece a
 * convenção, pra nunca dessincronizar o texto usado em cada lugar.
 */
export const DRAFT_TEMPLATE_MARKER = "rascunho — revisar com jurídico";

export function draftTemplateName(baseName: string): string {
  return `${baseName} (${DRAFT_TEMPLATE_MARKER})`;
}

export function isDraftTemplateName(name: string): boolean {
  return name.includes(DRAFT_TEMPLATE_MARKER);
}
