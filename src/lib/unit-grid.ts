/**
 * Chave de coluna do espelho de vendas vertical (docs/ESPEC_MODULO_COMERCIAL.md,
 * Parte 1.3): unidades alinham em coluna pela posição no andar — por
 * convenção os dois últimos dígitos do número ("2601" → coluna "01").
 * Cai pra `position` (ex.: "Nascente") ou pro próprio número quando o
 * padrão não bate (loteamento, numeração livre).
 */
export function getUnitColumnKey(unit: { number: string; position?: string | null }): string {
  const match = unit.number.match(/(\d{2})$/);
  if (match) return match[1];
  return unit.position || unit.number;
}
