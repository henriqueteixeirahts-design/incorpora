import { describe, expect, it } from "vitest";
import { canSubmitForApproval } from "./proposal-status";

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
