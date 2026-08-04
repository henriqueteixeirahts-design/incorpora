import { describe, expect, it } from "vitest";
import {
  DOCUMENT_VARIABLE_CATALOG,
  resolveDocumentVariables,
  substituteTemplate,
  type DocumentVariableContext,
} from "./document-variables";

// toLocaleString("pt-BR", {style:"currency"}) usa espaço não-quebrável (U+00A0)
// entre "R$" e o valor — usar essa mesma função nos asserts em vez de literais
// com espaço comum evita falso-negativo por diferença de caractere invisível.
function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const BASE_CTX: DocumentVariableContext = {
  organization: { name: "TSH Incorporadora" },
  spe: {
    name: "SPE Teste",
    document: "12345678000195",
    addressFormatted: "Rua A, 100 — Centro, Goiânia/GO",
    representativeName: "Fulano de Tal",
  },
  development: {
    name: "Residencial Teste",
    addressFormatted: "Av. B, 200 — Setor Sul, Goiânia/GO",
    motherPropertyRecord: "12345",
    registrationNumber: "R-1-98765",
    expectedDeliveryDate: new Date(2027, 5, 1),
  },
  unit: {
    identification: "Apto 101",
    area: 80.5,
    idealFraction: 1.234,
    parkingSpaces: ["V-01"],
  },
  customer: {
    name: "Cliente Teste",
    document: "02654427102",
    addressFormatted: "Rua C, 300 — Bairro X, Goiânia/GO",
    maritalStatus: "Casado",
    nationality: "Brasileira",
    profession: "Engenheiro",
  },
  sale: { totalValue: 500000 },
  flow: {
    items: [
      { label: "Entrada", dueOffsetMonths: 0, amount: 100000 },
      { label: "Parcela mensal 1/2", dueOffsetMonths: 1, amount: 200000 },
      { label: "Parcela mensal 2/2", dueOffsetMonths: 2, amount: 200000 },
    ],
    downPaymentAmount: 100000,
  },
  correction: { preHabiteSeIndexName: "INCC-M", postHabiteSeIndexName: "IGP-M" },
  commission: { percent: 6, totalValue: 30000 },
  penalties: { finePercent: 2, monthlyInterestPercent: 1 },
  amendment: null,
  assignment: null,
  distrato: null,
};

describe("resolveDocumentVariables", () => {
  it("resolve todos os escalares do catálogo da spec", () => {
    const { scalars } = resolveDocumentVariables(BASE_CTX);

    expect(scalars["cliente.nome"]).toBe("Cliente Teste");
    expect(scalars["cliente.cpf_cnpj"]).toBe("02654427102");
    expect(scalars["cliente.estado_civil"]).toBe("Casado");
    expect(scalars["spe.razao_social"]).toBe("SPE Teste");
    expect(scalars["spe.cnpj"]).toBe("12345678000195");
    expect(scalars["empreendimento.nome"]).toBe("Residencial Teste");
    expect(scalars["empreendimento.matricula"]).toBe("12345");
    expect(scalars["unidade.identificacao"]).toBe("Apto 101");
    expect(scalars["unidade.area"]).toBe("80.5 m²");
    expect(scalars["unidade.vagas"]).toBe("V-01");
    expect(scalars["venda.valor_total"]).toBe(brl(500000));
    expect(scalars["venda.valor_extenso"]).toBe("quinhentos mil reais");
    expect(scalars["fluxo.entrada"]).toBe(brl(100000));
    expect(scalars["fluxo.indice_obra"]).toBe("INCC-M");
    expect(scalars["fluxo.indice_pos_chaves"]).toBe("IGP-M");
  });

  it("campos vazios no cadastro (não digitados) ficam com string vazia — não confundir com token desconhecido", () => {
    const ctx: DocumentVariableContext = {
      ...BASE_CTX,
      customer: { ...BASE_CTX.customer, maritalStatus: null, nationality: null, profession: null },
    };
    const { scalars } = resolveDocumentVariables(ctx);
    expect(scalars["cliente.estado_civil"]).toBe("");
    expect(scalars["cliente.nacionalidade"]).toBe("");
    expect(scalars["cliente.profissao"]).toBe("");
  });

  it("sem vaga vinculada, resolve pra 'Nenhuma' — estado legítimo, não lacuna", () => {
    const ctx: DocumentVariableContext = { ...BASE_CTX, unit: { ...BASE_CTX.unit, parkingSpaces: [] } };
    const { scalars } = resolveDocumentVariables(ctx);
    expect(scalars["unidade.vagas"]).toBe("Nenhuma");
  });

  it("sem índice cadastrado, resolve pro rótulo de juros fixos — não bloqueia geração", () => {
    const ctx: DocumentVariableContext = {
      ...BASE_CTX,
      correction: { preHabiteSeIndexName: null, postHabiteSeIndexName: null },
    };
    const { scalars } = resolveDocumentVariables(ctx);
    expect(scalars["fluxo.indice_obra"]).toBe("Sem índice (juros contratuais fixos)");
    expect(scalars["fluxo.indice_pos_chaves"]).toBe("Sem índice (juros contratuais fixos)");
  });

  it("bloco quadro_resumo inclui preço, forma de pagamento, índices, comissão, prazo e penalidades", () => {
    const { blocks } = resolveDocumentVariables(BASE_CTX);
    const resumo = blocks.quadro_resumo;

    expect(resumo).toContain(brl(500000));
    expect(resumo).toContain("quinhentos mil reais");
    expect(resumo).toContain(`Entrada — ${brl(100000)} (mês 0)`);
    expect(resumo).toContain("INCC-M");
    expect(resumo).toContain("IGP-M");
    expect(resumo).toContain(`6% (${brl(30000)})`);
    expect(resumo).toContain("tolerância legal de 180 dias");
    expect(resumo).toContain("multa de 2%");
    expect(resumo).toContain("juros de 1% ao mês");
  });

  it("prazo de entrega soma exatamente 180 dias corridos — conferido à mão", () => {
    const ctx: DocumentVariableContext = {
      ...BASE_CTX,
      development: { ...BASE_CTX.development, expectedDeliveryDate: new Date(2027, 0, 1) }, // 01/01/2027
    };
    const { blocks } = resolveDocumentVariables(ctx);
    // 01/01/2027 + 180 dias = 30/06/2027 (conferido: jan31+fev28+mar31+abr30+mai31+jun29=180)
    expect(blocks.quadro_resumo).toContain("até 30/06/2027");
  });

  it("todo token listado no catálogo exibido no editor resolve de fato (evita drift entre UI e resolver)", () => {
    const { scalars, blocks } = resolveDocumentVariables(BASE_CTX);
    const allKeys = DOCUMENT_VARIABLE_CATALOG.flatMap((g) => g.tokens.map((t) => t.key));
    for (const key of allKeys) {
      const isBlock = key in blocks;
      const isScalar = key in scalars;
      expect(isBlock || isScalar, `token "${key}" do catálogo não existe no resolver`).toBe(true);
    }
  });
});

describe("substituteTemplate", () => {
  const resolved = resolveDocumentVariables(BASE_CTX);

  it("substitui variáveis escalares inline dentro de uma frase", () => {
    const { text, missing } = substituteTemplate(
      "O(a) comprador(a) {{cliente.nome}}, portador(a) do CPF/CNPJ {{cliente.cpf_cnpj}}.",
      resolved,
    );
    expect(text).toBe("O(a) comprador(a) Cliente Teste, portador(a) do CPF/CNPJ 02654427102.");
    expect(missing).toEqual([]);
  });

  it("parágrafo com só o token de bloco vira o bloco inteiro", () => {
    const { text, missing } = substituteTemplate(
      "Segue o quadro-resumo:\n\n{{quadro_resumo}}\n\nAssinaturas.",
      resolved,
    );
    expect(text).toContain(`Preço: ${brl(500000)}`);
    expect(text).toContain("Assinaturas.");
    expect(missing).toEqual([]);
  });

  it("token de bloco embutido inline também resolve (fallback pro texto do bloco)", () => {
    const { text, missing } = substituteTemplate("Fluxo: {{fluxo.parcelas_tabela}}.", resolved);
    expect(text).toContain(`Entrada — ${brl(100000)} (mês 0)`);
    expect(missing).toEqual([]);
  });

  it("variável com dado vazio no cadastro entra em 'missing' e o token permanece no texto", () => {
    const ctxSemEstadoCivil = resolveDocumentVariables({
      ...BASE_CTX,
      customer: { ...BASE_CTX.customer, maritalStatus: null },
    });
    const { text, missing } = substituteTemplate("Estado civil: {{cliente.estado_civil}}.", ctxSemEstadoCivil);
    expect(missing).toEqual(["cliente.estado_civil"]);
    expect(text).toBe("Estado civil: {{cliente.estado_civil}}.");
  });

  it("token desconhecido (typo) também entra em 'missing'", () => {
    const { missing } = substituteTemplate("{{cliente.nome_completo_errado}}", resolved);
    expect(missing).toEqual(["cliente.nome_completo_errado"]);
  });

  it("mesma variável faltando duas vezes aparece uma única vez em 'missing'", () => {
    const ctxSemEstadoCivil = resolveDocumentVariables({
      ...BASE_CTX,
      customer: { ...BASE_CTX.customer, maritalStatus: null },
    });
    const { missing } = substituteTemplate(
      "{{cliente.estado_civil}} ... {{cliente.estado_civil}}",
      ctxSemEstadoCivil,
    );
    expect(missing).toEqual(["cliente.estado_civil"]);
  });
});
