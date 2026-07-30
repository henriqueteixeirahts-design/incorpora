// Conversão de valor monetário para extenso em português (docs/
// ESPEC_FASE_A_CONTRATOS_VENDAS.md, Parte 1.3 — {{venda.valor_extenso}}).
// Cálculo puro, sem I/O.

const UNITS = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
];
const TEENS = [
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];
const TENS = [
  "", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa",
];
const HUNDREDS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];

/** Converte um grupo de 0-999 para extenso (sem escala/sufixo). */
function groupToWords(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";

  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];

  if (h > 0) parts.push(HUNDREDS[h]);

  if (rest > 0) {
    if (rest < 10) {
      parts.push(UNITS[rest]);
    } else if (rest < 20) {
      parts.push(TEENS[rest - 10]);
    } else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u > 0 ? `${TENS[t]} e ${UNITS[u]}` : TENS[t]);
    }
  }

  return parts.join(" e ");
}

type Scale = { divisor: number; singular: string; plural: string };

const SCALES: Scale[] = [
  { divisor: 1_000_000_000, singular: "bilhão", plural: "bilhões" },
  { divisor: 1_000_000, singular: "milhão", plural: "milhões" },
  { divisor: 1_000, singular: "mil", plural: "mil" },
];

/** Converte um inteiro não-negativo para extenso, com nome de unidade final (singular/plural). */
function integerToWords(value: number, unitSingular: string, unitPlural: string): string {
  if (value === 0) return `zero ${unitPlural}`;

  const groups: { amount: number; scale: Scale | null }[] = [];
  let remaining = value;

  for (const scale of SCALES) {
    const amount = Math.floor(remaining / scale.divisor);
    if (amount > 0) {
      groups.push({ amount, scale });
      remaining -= amount * scale.divisor;
    }
  }
  if (remaining > 0 || groups.length === 0) {
    groups.push({ amount: remaining, scale: null });
  }

  const segments = groups.map(({ amount, scale }) => {
    if (!scale) return groupToWords(amount);
    const scaleName = amount === 1 ? scale.singular : scale.plural;
    if (amount === 1) {
      // "mil" sozinho (não "um mil"); "um milhão"/"um bilhão" continuam com "um".
      return scale.divisor === 1_000 ? scaleName : `um ${scaleName}`;
    }
    return `${groupToWords(amount)} ${scaleName}`;
  });

  // Classes separadas por vírgula, exceto a última — sempre ligada à
  // anterior por "e" (convenção de extenso: "um milhão, duzentos mil e
  // trinta reais", nunca vírgula antes da última classe).
  const lastGroup = groups[groups.length - 1];
  const isRoundScale = lastGroup.scale !== null && lastGroup.scale.divisor !== 1_000 && groups.length === 1;

  let joined: string;
  if (segments.length === 1) {
    joined = segments[0];
  } else {
    const head = segments.slice(0, -1).join(", ");
    joined = `${head} e ${segments[segments.length - 1]}`;
  }

  const unitName = value === 1 ? unitSingular : unitPlural;
  return isRoundScale ? `${joined} de ${unitName}` : `${joined} ${unitName}`;
}

/** Valor monetário (BRL) por extenso, ex.: "quinhentos mil reais e cinquenta centavos". */
export function currencyToExtenso(value: number): string {
  const rounded = Math.round(Math.abs(value) * 100) / 100;
  const wholeReais = Math.floor(rounded);
  const cents = Math.round((rounded - wholeReais) * 100);

  const reaisWords = integerToWords(wholeReais, "real", "reais");
  if (cents === 0) return reaisWords;

  const centsWords = integerToWords(cents, "centavo", "centavos");
  return `${reaisWords} e ${centsWords}`;
}
