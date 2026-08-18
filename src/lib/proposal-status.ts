/**
 * Uma proposta reprovada automaticamente é fim de linha — não deve
 * oferecer "Enviar para aprovação" mesmo enquanto `status` ainda é DRAFT
 * (docs/RELATORIO_TESTDRIVE.md, F1: o botão reincidiu em toda proposta
 * reprovada, porque a condição só checava `status`, não `evaluationStatus`).
 */
export function canSubmitForApproval(proposal: { status: string; evaluationStatus: string | null }): boolean {
  return proposal.status === "DRAFT" && proposal.evaluationStatus !== "REJECTED_AUTO";
}
