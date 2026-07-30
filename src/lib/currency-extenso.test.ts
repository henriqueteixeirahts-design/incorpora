import { describe, expect, it } from "vitest";
import { currencyToExtenso } from "./currency-extenso";

describe("currencyToExtenso", () => {
  it("valores redondos pequenos", () => {
    expect(currencyToExtenso(0)).toBe("zero reais");
    expect(currencyToExtenso(1)).toBe("um real");
    expect(currencyToExtenso(2)).toBe("dois reais");
    expect(currencyToExtenso(10)).toBe("dez reais");
    expect(currencyToExtenso(15)).toBe("quinze reais");
  });

  it("cem é exceção — não 'cento'", () => {
    expect(currencyToExtenso(100)).toBe("cem reais");
    expect(currencyToExtenso(101)).toBe("cento e um reais");
    expect(currencyToExtenso(199)).toBe("cento e noventa e nove reais");
  });

  it("mil sozinho não vira 'um mil'", () => {
    expect(currencyToExtenso(1000)).toBe("mil reais");
    expect(currencyToExtenso(1001)).toBe("mil e um reais");
    expect(currencyToExtenso(1100)).toBe("mil e cem reais");
    expect(currencyToExtenso(21000)).toBe("vinte e um mil reais");
  });

  it("centenas de milhar", () => {
    expect(currencyToExtenso(500000)).toBe("quinhentos mil reais");
  });

  it("milhão/bilhão redondos levam 'de'", () => {
    expect(currencyToExtenso(1000000)).toBe("um milhão de reais");
    expect(currencyToExtenso(2000000)).toBe("dois milhões de reais");
    expect(currencyToExtenso(1000000000)).toBe("um bilhão de reais");
  });

  it("milhão não redondo não leva 'de'", () => {
    expect(currencyToExtenso(1500000)).toBe("um milhão e quinhentos mil reais");
  });

  it("valor composto com milhão + milhar + unidade — conferido à mão", () => {
    // 1.234.567 = 1 milhão + 234 mil + 567 — vírgula entre as duas primeiras
    // classes, "e" ligando a última (convenção de extenso bancário).
    expect(currencyToExtenso(1234567)).toBe(
      "um milhão, duzentos e trinta e quatro mil e quinhentos e sessenta e sete reais",
    );
  });

  it("centavos entram só quando não-zero", () => {
    expect(currencyToExtenso(500000.5)).toBe("quinhentos mil reais e cinquenta centavos");
    expect(currencyToExtenso(500000.0)).toBe("quinhentos mil reais");
    expect(currencyToExtenso(1234567.89)).toBe(
      "um milhão, duzentos e trinta e quatro mil e quinhentos e sessenta e sete reais e oitenta e nove centavos",
    );
  });

  it("um centavo/um real fica no singular", () => {
    expect(currencyToExtenso(1.01)).toBe("um real e um centavo");
  });

  it("arredonda pra 2 casas antes de converter (evita ruído de ponto flutuante)", () => {
    // 0.1 + 0.2 em ponto flutuante dá 0.30000000000000004 — precisa arredondar antes.
    expect(currencyToExtenso(0.1 + 0.2)).toBe("zero reais e trinta centavos");
  });
});
