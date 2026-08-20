// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddressFields } from "./AddressFields";

/**
 * docs/RELATORIO_TESTDRIVE.md, achado 3 — trocar o CEP depois de já ter um
 * endereço preenchido não atualizava o logradouro; causa raiz era uma
 * guarda (`!streetInputRef.current.value`) que só existia no campo
 * Logradouro, não nos outros 3 campos auto-preenchidos. Regressão: simula
 * duas buscas de CEP em sequência com respostas diferentes e confirma que
 * o logradouro (e os demais campos) refletem o segundo resultado, não
 * ficam travados no primeiro.
 */

const VIACEP_RESPONSES: Record<string, unknown> = {
  "74115060": { logradouro: "Rua T-1", bairro: "Setor Bueno", localidade: "Goiânia", uf: "GO" },
  "01310100": { logradouro: "Avenida Paulista", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP" },
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const cep = String(url).match(/ws\/(\d{8})\/json/)?.[1] ?? "";
      return {
        ok: true,
        json: async () => VIACEP_RESPONSES[cep] ?? { erro: true },
      };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AddressFields — autocomplete de CEP", () => {
  it("atualiza o endereço na segunda busca, não só na primeira", async () => {
    render(<AddressFields />);

    const cepInput = screen.getByLabelText("CEP") as HTMLInputElement;
    const streetInput = screen.getByLabelText("Logradouro") as HTMLInputElement;
    const neighborhoodInput = screen.getByLabelText("Bairro") as HTMLInputElement;
    const cityInput = screen.getByLabelText("Cidade") as HTMLInputElement;
    const stateInput = screen.getByLabelText("UF") as HTMLInputElement;

    fireEvent.change(cepInput, { target: { value: "74115060" } });
    fireEvent.blur(cepInput);
    await waitFor(() => expect(streetInput.value).toBe("Rua T-1"));
    expect(neighborhoodInput.value).toBe("Setor Bueno");
    expect(cityInput.value).toBe("Goiânia");
    expect(stateInput.value).toBe("GO");

    fireEvent.change(cepInput, { target: { value: "01310100" } });
    fireEvent.blur(cepInput);
    await waitFor(() => expect(streetInput.value).toBe("Avenida Paulista"));
    expect(neighborhoodInput.value).toBe("Bela Vista");
    expect(cityInput.value).toBe("São Paulo");
    expect(stateInput.value).toBe("SP");
  });
});
