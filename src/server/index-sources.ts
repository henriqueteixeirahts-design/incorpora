import "server-only";

import type { IndexCode } from "@/generated/prisma/client";

/**
 * Códigos das séries no SGS (Sistema Gerenciador de Séries Temporais) do
 * Banco Central — API pública, sem autenticação. Cada série é a variação
 * percentual mensal do índice.
 *
 * 433 = IPCA (IBGE), 189 = IGP-M (FGV), 192 = INCC-DI (FGV) — o Banco
 * Central republica as séries do IBGE/FGV, então uma única fonte cobre
 * os três índices usados no catálogo. FIXED não tem fonte externa (é uma
 * taxa fixa definida no próprio contrato).
 */
const BCB_SERIES: Partial<Record<IndexCode, number>> = {
  IPCA: 433,
  IGPM: 189,
  INCC: 192,
};

type BcbObservation = { data: string; valor: string };

function formatBcbDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

/**
 * Busca a variação percentual oficial de um índice para um mês específico.
 * Retorna null se o código não tem fonte externa (FIXED) ou se o Banco
 * Central ainda não publicou aquele mês (comum: IGP-M sai perto do fim do
 * próprio mês, IPCA e INCC saem só no mês seguinte).
 */
export async function fetchOfficialIndexRate(
  code: IndexCode,
  referenceMonth: Date,
): Promise<number | null> {
  const series = BCB_SERIES[code];
  if (!series) return null;

  const start = new Date(referenceMonth.getFullYear(), referenceMonth.getMonth(), 1);
  const url =
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${series}/dados` +
    `?formato=json&dataInicial=${formatBcbDate(start)}&dataFinal=${formatBcbDate(start)}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (response.status === 404) return null; // mês ainda não publicado
  if (!response.ok) {
    throw new Error(`Banco Central respondeu ${response.status} para a série ${series}.`);
  }

  const data = (await response.json()) as BcbObservation[];
  if (data.length === 0) return null;

  return Number(data[0].valor.replace(",", "."));
}

export function isOfficialSourceAvailable(code: IndexCode) {
  return code in BCB_SERIES;
}
