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

/** Sentinela pra lotes sem quadra cadastrada — nunca confundível com uma quadra real. */
export const UNASSIGNED_BLOCK = "__sem_quadra__";

/**
 * Agrupa lotes de loteamento por quadra (docs/ESPEC_MODULO_COMERCIAL.md,
 * Parte 1.4a) — uma seção por quadra, ordenadas naturalmente ("Quadra 2"
 * antes de "Quadra 10"), lotes dentro de cada quadra também em ordem
 * natural pelo número.
 */
export function groupLotsByBlock<T extends { number: string; block: string | null }>(
  lots: T[],
): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const lot of lots) {
    const key = lot.block ?? UNASSIGNED_BLOCK;
    const list = map.get(key) ?? [];
    list.push(lot);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
}
