/**
 * Erro de validação de negócio — a mensagem é segura pra mostrar direto ao
 * usuário. Qualquer outro erro (Prisma, rede, bug) NÃO deve ter `.message`
 * repassado cru pra tela (docs/RELATORIO_TESTDRIVE.md, B1) — as actions
 * devem checar `instanceof ValidationError` antes de exibir a mensagem.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
