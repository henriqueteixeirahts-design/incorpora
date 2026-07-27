import { describe, it, expect } from "vitest";
import {
  onlyDigits,
  isValidCpf,
  isValidCnpj,
  formatCpf,
  formatCnpj,
  formatDocument,
  isValidDocument,
  formatPhone,
  isValidBrazilianPhone,
  formatCep,
  isValidEmail,
} from "./br-validation";

describe("onlyDigits", () => {
  it("remove tudo que não for dígito", () => {
    expect(onlyDigits("026.544.271-02")).toBe("02654427102");
    expect(onlyDigits("(62) 99999-0000")).toBe("62999990000");
  });
});

describe("isValidCpf", () => {
  it("aceita CPFs reais válidos", () => {
    // CPF real usado em produção nesta sessão, confirmado válido
    expect(isValidCpf("02654427102")).toBe(true);
    expect(isValidCpf("026.544.271-02")).toBe(true);
  });

  it("rejeita sequências de dígito repetido, mesmo passando no dígito verificador", () => {
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("00000000000")).toBe(false);
  });

  it("rejeita CPF com dígito verificador errado", () => {
    expect(isValidCpf("02654427103")).toBe(false);
  });

  it("rejeita tamanho errado", () => {
    expect(isValidCpf("123")).toBe(false);
    expect(isValidCpf("")).toBe(false);
  });
});

describe("isValidCnpj", () => {
  it("aceita CNPJs reais válidos (SPEs reais da TSH)", () => {
    expect(isValidCnpj("63265390000141")).toBe(true);
    expect(isValidCnpj("46127017000105")).toBe(true);
    expect(isValidCnpj("63.265.390/0001-41")).toBe(true);
  });

  it("rejeita sequência de dígito repetido", () => {
    expect(isValidCnpj("00000000000000")).toBe(false);
  });

  it("rejeita CNPJ com dígito verificador errado", () => {
    expect(isValidCnpj("63265390000142")).toBe(false);
  });
});

describe("formatCpf / formatCnpj", () => {
  it("formata CPF com máscara padrão", () => {
    expect(formatCpf("02654427102")).toBe("026.544.271-02");
  });
  it("formata CNPJ com máscara padrão", () => {
    expect(formatCnpj("63265390000141")).toBe("63.265.390/0001-41");
  });
  it("trunca dígitos excedentes em vez de quebrar", () => {
    expect(formatCpf("026544271029999")).toBe("026.544.271-02");
  });
});

describe("formatDocument / isValidDocument", () => {
  it("despacha pra CPF quando type=INDIVIDUAL", () => {
    expect(formatDocument("02654427102", "INDIVIDUAL")).toBe("026.544.271-02");
    expect(isValidDocument("02654427102", "INDIVIDUAL")).toBe(true);
  });
  it("despacha pra CNPJ quando type=COMPANY", () => {
    expect(formatDocument("63265390000141", "COMPANY")).toBe("63.265.390/0001-41");
    expect(isValidDocument("63265390000141", "COMPANY")).toBe(true);
  });
});

describe("formatPhone / isValidBrazilianPhone", () => {
  it("formata celular (11 dígitos) com máscara de 5 dígitos", () => {
    expect(formatPhone("62999990000")).toBe("(62) 99999-0000");
  });
  it("formata fixo (10 dígitos) com máscara de 4 dígitos", () => {
    expect(formatPhone("6233330000")).toBe("(62) 3333-0000");
  });
  it("valida DDD dentro do intervalo 11-99", () => {
    expect(isValidBrazilianPhone("62999990000")).toBe(true);
    expect(isValidBrazilianPhone("00999990000")).toBe(false);
  });
  it("rejeita tamanho errado", () => {
    expect(isValidBrazilianPhone("123")).toBe(false);
  });
});

describe("formatCep", () => {
  it("formata CEP com máscara padrão", () => {
    expect(formatCep("74115060")).toBe("74115-060");
  });
});

describe("isValidEmail", () => {
  it("aceita formato básico válido", () => {
    expect(isValidEmail("henrique@tsh.com.br")).toBe(true);
  });
  it("rejeita sem @ ou sem domínio", () => {
    expect(isValidEmail("henrique")).toBe(false);
    expect(isValidEmail("henrique@")).toBe(false);
  });
});
