// Catálogo de variáveis + motor de substituição do template de documento
// (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md, Parte 1.3). Cálculo puro, sem I/O —
// quem busca os dados no banco é a camada de servidor
// (src/server/document-generation.ts), que monta o `DocumentVariableContext`
// e chama `resolveDocumentVariables` + `substituteTemplate` daqui.

import { currencyToExtenso } from "@/lib/currency-extenso";

/** Catálogo exibido no editor de modelos (spec 1.3) — a lista de tokens em `resolveDocumentVariables` deve espelhar exatamente essas chaves. */
export const DOCUMENT_VARIABLE_CATALOG: { group: string; tokens: { key: string; label: string }[] }[] = [
  {
    group: "Cliente",
    tokens: [
      { key: "cliente.nome", label: "Nome" },
      { key: "cliente.cpf_cnpj", label: "CPF/CNPJ" },
      { key: "cliente.endereco_completo", label: "Endereço completo" },
      { key: "cliente.estado_civil", label: "Estado civil" },
      { key: "cliente.nacionalidade", label: "Nacionalidade" },
      { key: "cliente.profissao", label: "Profissão" },
    ],
  },
  {
    group: "SPE",
    tokens: [
      { key: "spe.razao_social", label: "Razão social" },
      { key: "spe.cnpj", label: "CNPJ" },
      { key: "spe.endereco", label: "Endereço" },
      { key: "spe.representante", label: "Representante legal" },
    ],
  },
  {
    group: "Empreendimento",
    tokens: [
      { key: "empreendimento.nome", label: "Nome" },
      { key: "empreendimento.endereco", label: "Endereço" },
      { key: "empreendimento.matricula", label: "Matrícula-mãe" },
      { key: "empreendimento.registro_incorporacao", label: "Registro da incorporação" },
    ],
  },
  {
    group: "Unidade",
    tokens: [
      { key: "unidade.identificacao", label: "Identificação" },
      { key: "unidade.area", label: "Área" },
      { key: "unidade.vagas", label: "Vagas de garagem" },
      { key: "unidade.fracao_ideal", label: "Fração ideal" },
    ],
  },
  {
    group: "Venda/fluxo",
    tokens: [
      { key: "venda.valor_total", label: "Valor total" },
      { key: "venda.valor_extenso", label: "Valor por extenso" },
      { key: "fluxo.entrada", label: "Valor da entrada" },
      { key: "fluxo.parcelas_tabela", label: "Tabela do fluxo completo (bloco)" },
      { key: "fluxo.indice_obra", label: "Índice — fase de obra" },
      { key: "fluxo.indice_pos_chaves", label: "Índice — pós-chaves" },
    ],
  },
  {
    group: "Quadro-resumo",
    tokens: [
      {
        key: "quadro_resumo",
        label: "Bloco pronto (Lei 13.786/18) — preço, forma de pagamento, índice, comissão, prazo, penalidades",
      },
    ],
  },
  {
    group: "Aditivo",
    tokens: [
      { key: "aditivo.numero", label: "Número do aditivo (ex.: CT-2026-0001-AD01)" },
      { key: "aditivo.tipo", label: "Tipo do aditivo" },
    ],
  },
];

export type DocumentVariableContext = {
  organization: { name: string };
  spe: {
    name: string;
    document: string;
    addressFormatted: string;
    representativeName: string | null;
  };
  development: {
    name: string;
    addressFormatted: string;
    motherPropertyRecord: string | null;
    registrationNumber: string | null;
    expectedDeliveryDate: Date | null;
  };
  unit: {
    identification: string;
    area: number | null;
    idealFraction: number | null;
    parkingSpaces: string[];
  };
  customer: {
    name: string;
    document: string;
    addressFormatted: string;
    maritalStatus: string | null;
    nationality: string | null;
    profession: string | null;
  };
  sale: { totalValue: number };
  flow: {
    items: { label: string; dueOffsetMonths: number; amount: number }[];
    downPaymentAmount: number;
  };
  correction: {
    preHabiteSeIndexName: string | null;
    postHabiteSeIndexName: string | null;
  };
  commission: { percent: number | null; totalValue: number | null };
  penalties: { finePercent: number; monthlyInterestPercent: number };
  /** Só presente quando o documento é gerado a partir de um aditivo (Fase A, Parte 2.2). */
  amendment: { number: string; typeLabel: string } | null;
};

export type ResolvedVariables = {
  /** "grupo.campo" -> valor resolvido (string vazia = não resolvido/faltando). */
  scalars: Record<string, string>;
  /** Tokens que substituem o parágrafo inteiro por um bloco de texto formatado. */
  blocks: Record<string, string>;
};

const NO_INDEX_LABEL = "Sem índice (juros contratuais fixos)";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR");
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatFlowTable(items: DocumentVariableContext["flow"]["items"]): string {
  return items
    .map((item) => `${item.label} — ${formatCurrency(item.amount)} (mês ${item.dueOffsetMonths})`)
    .join("\n");
}

function buildQuadroResumo(ctx: DocumentVariableContext): string {
  const indiceObra = ctx.correction.preHabiteSeIndexName ?? NO_INDEX_LABEL;
  const indicePosChaves = ctx.correction.postHabiteSeIndexName ?? NO_INDEX_LABEL;
  const comissao =
    ctx.commission.percent !== null && ctx.commission.totalValue !== null
      ? `${ctx.commission.percent}% (${formatCurrency(ctx.commission.totalValue)})`
      : "Não aplicável";
  const prazoEntrega = ctx.development.expectedDeliveryDate
    ? `${formatDate(ctx.development.expectedDeliveryDate)} (tolerância legal de 180 dias — até ${formatDate(addDays(ctx.development.expectedDeliveryDate, 180))})`
    : "Não definido no cadastro do empreendimento";

  return [
    `Preço: ${formatCurrency(ctx.sale.totalValue)} (${currencyToExtenso(ctx.sale.totalValue)})`,
    `Forma de pagamento:\n${formatFlowTable(ctx.flow.items)}`,
    `Índice de correção — fase de obra: ${indiceObra}`,
    `Índice de correção — pós-chaves: ${indicePosChaves}`,
    `Comissão de corretagem: ${comissao}`,
    `Prazo de entrega: ${prazoEntrega}`,
    `Penalidades por atraso: multa de ${ctx.penalties.finePercent}% + juros de ${ctx.penalties.monthlyInterestPercent}% ao mês`,
  ].join("\n\n");
}

/** Constrói o catálogo de variáveis escalares + blocos a partir do contexto já buscado do banco. */
export function resolveDocumentVariables(ctx: DocumentVariableContext): ResolvedVariables {
  const scalars: Record<string, string> = {
    "cliente.nome": ctx.customer.name,
    "cliente.cpf_cnpj": ctx.customer.document,
    "cliente.endereco_completo": ctx.customer.addressFormatted,
    "cliente.estado_civil": ctx.customer.maritalStatus ?? "",
    "cliente.nacionalidade": ctx.customer.nationality ?? "",
    "cliente.profissao": ctx.customer.profession ?? "",

    "spe.razao_social": ctx.spe.name,
    "spe.cnpj": ctx.spe.document,
    "spe.endereco": ctx.spe.addressFormatted,
    "spe.representante": ctx.spe.representativeName ?? "",

    "empreendimento.nome": ctx.development.name,
    "empreendimento.endereco": ctx.development.addressFormatted,
    "empreendimento.matricula": ctx.development.motherPropertyRecord ?? "",
    "empreendimento.registro_incorporacao": ctx.development.registrationNumber ?? "",

    "unidade.identificacao": ctx.unit.identification,
    "unidade.area": ctx.unit.area !== null ? `${ctx.unit.area} m²` : "",
    "unidade.vagas": ctx.unit.parkingSpaces.length > 0 ? ctx.unit.parkingSpaces.join(", ") : "Nenhuma",
    "unidade.fracao_ideal": ctx.unit.idealFraction !== null ? `${ctx.unit.idealFraction}%` : "",

    "venda.valor_total": formatCurrency(ctx.sale.totalValue),
    "venda.valor_extenso": currencyToExtenso(ctx.sale.totalValue),

    "fluxo.entrada": formatCurrency(ctx.flow.downPaymentAmount),
    "fluxo.indice_obra": ctx.correction.preHabiteSeIndexName ?? NO_INDEX_LABEL,
    "fluxo.indice_pos_chaves": ctx.correction.postHabiteSeIndexName ?? NO_INDEX_LABEL,

    "aditivo.numero": ctx.amendment?.number ?? "",
    "aditivo.tipo": ctx.amendment?.typeLabel ?? "",
  };

  const blocks: Record<string, string> = {
    "fluxo.parcelas_tabela": formatFlowTable(ctx.flow.items),
    quadro_resumo: buildQuadroResumo(ctx),
  };

  return { scalars, blocks };
}

const VARIABLE_TOKEN = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;

export type SubstitutionResult = { text: string; missing: string[] };

/**
 * Substitui as variáveis do corpo do template. Parágrafos que consistem
 * SÓ de um token de bloco (`{{fluxo.parcelas_tabela}}`, `{{quadro_resumo}}`)
 * viram o bloco formatado inteiro; os demais tokens são substituídos
 * inline. Variáveis sem valor resolvido (desconhecidas OU com dado vazio no
 * cadastro) ficam na lista `missing` — a geração do PDF não deve prosseguir
 * enquanto essa lista não estiver vazia (spec 1.4: "não gerar documento com
 * lacunas {{}}").
 */
export function substituteTemplate(content: string, resolved: ResolvedVariables): SubstitutionResult {
  const missing = new Set<string>();

  const paragraphs = content.split(/\n\s*\n/).map((paragraph) => {
    const trimmed = paragraph.trim();
    const blockMatch = trimmed.match(/^\{\{\s*([a-z0-9_.]+)\s*\}\}$/i);
    if (blockMatch && blockMatch[1] in resolved.blocks) {
      return resolved.blocks[blockMatch[1]];
    }

    return paragraph.replace(VARIABLE_TOKEN, (fullMatch, key: string) => {
      if (key in resolved.blocks) return resolved.blocks[key];
      const value = resolved.scalars[key];
      if (value === undefined || value === "") {
        missing.add(key);
        return fullMatch;
      }
      return value;
    });
  });

  return { text: paragraphs.join("\n\n"), missing: Array.from(missing) };
}
