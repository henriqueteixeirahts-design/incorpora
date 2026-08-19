/**
 * Área de exibição de uma unidade — prioridade privativa > total > lote
 * (docs/RELATORIO_TESTDRIVE.md, achado 22: o espelho de vendas e o gerador
 * de documento liam campos diferentes — o espelho já usava essa prioridade,
 * o gerador só lia `totalArea` — e uma unidade com só `privateArea`
 * preenchida aparecia no espelho mas resolvia `unidade.area` vazio no
 * documento). Único lugar que decide isso agora; os dois pontos de consumo
 * chamam esta função em vez de repetir a prioridade cada um do seu jeito.
 */
export function resolveUnitArea(unit: {
  privateArea: number | null;
  totalArea: number | null;
  lotArea: number | null;
}): number | null {
  if (unit.privateArea !== null) return unit.privateArea;
  if (unit.totalArea !== null) return unit.totalArea;
  if (unit.lotArea !== null) return unit.lotArea;
  return null;
}
