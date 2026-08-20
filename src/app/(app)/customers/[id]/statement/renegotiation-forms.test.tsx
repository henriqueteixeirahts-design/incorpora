// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RenegotiationSection } from "./renegotiation-forms";

afterEach(cleanup);

/**
 * Sprint V5 — fecha a pendência R1 registrada em STATUS_IMPLANTACAO.md: o
 * formulário de novo acordo de renegociação empurrava o conteúdo da
 * carteira/extrato pra baixo (inline) em vez de abrir em modal/painel.
 * Regressão: confirma que o formulário só existe no DOM depois de clicar em
 * "+ Novo acordo" (não está sempre visível), e que ele desaparece ao fechar.
 */

vi.mock("./actions", () => ({
  createRenegotiationAction: vi.fn(),
  decideRenegotiationApprovalAction: vi.fn(),
  signRenegotiationAction: vi.fn(),
  generateRenegotiationPdfAction: vi.fn(),
}));

const baseProps = {
  customerId: "customer-1",
  contractId: "contract-1",
  agreements: [],
  openInstallments: [
    { id: "inst-1", label: "Parcela 1", dueDateLabel: "10/09/2026", resultValue: 1000 },
  ],
  templates: [],
  canEdit: true,
  canGenerateDocument: false,
};

describe("RenegotiationSection — R1 (modal, não inline)", () => {
  it("não renderiza o formulário de novo acordo até o usuário clicar em '+ Novo acordo'", () => {
    render(<RenegotiationSection {...baseProps} />);

    expect(screen.queryByText("Data do acordo")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "+ Novo acordo" }));
    expect(screen.getByText("Data do acordo")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("fecha o modal e remove o formulário do DOM ao clicar em Fechar", () => {
    render(<RenegotiationSection {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Novo acordo" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    const closeButtons = screen.getAllByRole("button", { name: "Fechar" });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sem permissão de editar, não mostra o botão de novo acordo", () => {
    render(<RenegotiationSection {...baseProps} canEdit={false} />);
    expect(screen.queryByRole("button", { name: "+ Novo acordo" })).toBeNull();
  });
});
