import { describe, expect, it } from "vitest";
import { draftTemplateName, isDraftTemplateName } from "./document-template-draft";

describe("draftTemplateName / isDraftTemplateName", () => {
  it("marca o nome com o sufixo de rascunho e o reconhece de volta", () => {
    const name = draftTemplateName("Distrato");
    expect(name).toBe("Distrato (rascunho — revisar com jurídico)");
    expect(isDraftTemplateName(name)).toBe(true);
  });

  it("reconhece a marca mesmo com sufixo extra depois (ex.: versão) na label exibida", () => {
    const label = `${draftTemplateName("Extrato")} (v1)`;
    expect(isDraftTemplateName(label)).toBe(true);
  });

  it("não marca um nome de modelo real como rascunho", () => {
    expect(isDraftTemplateName("Contrato de compra e venda")).toBe(false);
  });
});
