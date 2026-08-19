/**
 * Uma proposta reprovada automaticamente é fim de linha — não deve
 * oferecer "Enviar para aprovação" mesmo enquanto `status` ainda é DRAFT
 * (docs/RELATORIO_TESTDRIVE.md, F1: o botão reincidiu em toda proposta
 * reprovada, porque a condição só checava `status`, não `evaluationStatus`).
 */
export function canSubmitForApproval(proposal: { status: string; evaluationStatus: string | null }): boolean {
  return proposal.status === "DRAFT" && proposal.evaluationStatus !== "REJECTED_AUTO";
}

/**
 * Fila do módulo de aprovação (docs/ESPEC_MODULO_COMERCIAL.md, Parte 5.2:
 * "fila das propostas em Aguardando análise") — só propostas realmente
 * pendentes de decisão, não a lista geral (docs/RELATORIO_TESTDRIVE.md,
 * achado 17: a tela antiga não tinha um lugar dedicado pra isso).
 */
export function isPendingApproval(proposal: { status: string; approvals: { decision: string }[] }): boolean {
  return proposal.status === "PENDING_APPROVAL" && proposal.approvals.some((a) => a.decision === "PENDING");
}
