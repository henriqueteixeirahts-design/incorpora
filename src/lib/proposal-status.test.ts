import { describe, expect, it } from "vitest";
import { canSubmitForApproval, isPendingApproval } from "./proposal-status";

describe("canSubmitForApproval", () => {
  it("permite enviar rascunho aprovado automaticamente", () => {
    expect(canSubmitForApproval({ status: "DRAFT", evaluationStatus: "APPROVED_AUTO" })).toBe(true);
  });

  it("permite enviar rascunho pendente de análise", () => {
    expect(canSubmitForApproval({ status: "DRAFT", evaluationStatus: "PENDING_ANALYSIS" })).toBe(true);
  });

  it("não permite enviar rascunho reprovado automaticamente (docs/RELATORIO_TESTDRIVE.md F1)", () => {
    expect(canSubmitForApproval({ status: "DRAFT", evaluationStatus: "REJECTED_AUTO" })).toBe(false);
  });

  it("não permite enviar proposta que já saiu do rascunho", () => {
    expect(canSubmitForApproval({ status: "PENDING_APPROVAL", evaluationStatus: "APPROVED_AUTO" })).toBe(false);
    expect(canSubmitForApproval({ status: "REJECTED", evaluationStatus: "REJECTED_AUTO" })).toBe(false);
  });
});

describe("isPendingApproval — fila do módulo de aprovação (docs/RELATORIO_TESTDRIVE.md achado 17)", () => {
  it("inclui proposta em aprovação com pelo menos uma alçada pendente", () => {
    expect(
      isPendingApproval({ status: "PENDING_APPROVAL", approvals: [{ decision: "PENDING" }] }),
    ).toBe(true);
  });

  it("exclui proposta em aprovação cujas alçadas já foram todas decididas", () => {
    expect(
      isPendingApproval({ status: "PENDING_APPROVAL", approvals: [{ decision: "APPROVED" }] }),
    ).toBe(false);
  });

  it("exclui proposta fora do status PENDING_APPROVAL, mesmo com alçada pendente registrada", () => {
    expect(
      isPendingApproval({ status: "APPROVED", approvals: [{ decision: "PENDING" }] }),
    ).toBe(false);
  });

  it("exclui proposta sem nenhuma alçada configurada", () => {
    expect(isPendingApproval({ status: "PENDING_APPROVAL", approvals: [] })).toBe(false);
  });
});
