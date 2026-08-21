import "server-only";

import type { AccessContext } from "@/server/auth-context";

/**
 * Helper central de escopo por organização (Pilar 1.3 de
 * docs/ESPEC_MULTITENANT_FUNDACOES.md). Cada função devolve a cláusula
 * `where` que garante que a entidade pertence à organização da sessão —
 * nunca de um id/param vindo do cliente. Import isto em vez de escrever a
 * cláusula de organização à mão em cada query, pra não depender de cada
 * função lembrar o filtro certo.
 *
 * `organizationId` só pode vir de `AccessContext` (derivado da sessão via
 * `requireAccessContext()`/`getAccessContext()`) — nunca de formData/params.
 */

/** Entidades com `organizationId` direto (Customer, Development, Payable, BankAccount, SpecialPurposeEntity...). */
export function orgScope(context: AccessContext) {
  return { organizationId: context.organizationId };
}

/** Entidades que pertencem a uma SPE (SpePartner, SpeInvestor, SpeLand, SpeBankAccount — via `speId`). */
export function speOwnedScope(context: AccessContext) {
  return { spe: { organizationId: context.organizationId } };
}

/** Entidades que pertencem a um Development (Unit, Building, SalesTable — via `developmentId`). */
export function developmentOwnedScope(context: AccessContext) {
  return { development: { organizationId: context.organizationId } };
}

/** Entidades que pertencem a uma SalesTable (SalesTableUnit — via `salesTableId`, 2 saltos até a organização). */
export function salesTableOwnedScope(context: AccessContext) {
  return { salesTable: { development: { organizationId: context.organizationId } } };
}

/** Entidades que pertencem a uma conta bancária central (SpeBankAccount — via `bankAccountId`). */
export function bankAccountOwnedScope(context: AccessContext) {
  return { bankAccount: { organizationId: context.organizationId } };
}

/** Entidades que pertencem a um Building (Floor — via `buildingId`, 2 saltos via Development). */
export function buildingOwnedScope(context: AccessContext) {
  return { building: { development: { organizationId: context.organizationId } } };
}

/** Entidades que pertencem a uma carteira de recebíveis (Installment — via `portfolioId`). */
export function portfolioOwnedScope(context: AccessContext) {
  return { portfolio: { organizationId: context.organizationId } };
}

/** Entidades que pertencem a uma parcela (InstallmentPayment, FinancialCalculation — via `installmentId`, 2 saltos). */
export function installmentOwnedScope(context: AccessContext) {
  return { installment: { portfolio: { organizationId: context.organizationId } } };
}

/**
 * Escopo por EMPREENDIMENTO (docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 2.5)
 * — segunda camada, além do isolamento por organização acima. Um usuário
 * com `AccessGrant` restrito a um/alguns empreendimentos não deve ver nem
 * alterar nada fora deles, mesmo dentro da própria organização.
 *
 * Por que é um mecanismo separado de `hasPermission` (não um 4º parâmetro
 * nela): quase todo call site de `hasPermission` checa a permissão *antes*
 * de buscar o registro (não tem `developmentId` em mãos ainda nesse ponto).
 * Este helper resolve o filtro de empreendimento no MESMO lugar/momento que
 * o filtro de organização acima — no `where` da query (listagens) ou numa
 * checagem logo após buscar o registro (registro único) — não na hora do
 * gate de permissão.
 *
 * Convenção de negação: igual ao isolamento por organização — bloqueado
 * por empreendimento responde "não encontrado", nunca "sem permissão" (não
 * confirma a um usuário sem acesso que o registro existe fora do alcance
 * dele).
 */

/** Entidades com `developmentId` direto (Unit, SalesTable, Reservation, Proposal, Sale, Contract via join, etc.) — pra usar no `where` de uma listagem. `{}` quando o usuário tem acesso a todos os empreendimentos. */
export function developmentAccessScope(context: AccessContext) {
  if (context.developmentAccess === "ALL") return {};
  return { developmentId: { in: [...context.developmentAccess] } };
}

/** Mesma ideia, pra queries direto em `Development` (o `id` do próprio registro, não um `developmentId` de FK). */
export function developmentIdAccessScope(context: AccessContext) {
  if (context.developmentAccess === "ALL") return {};
  return { id: { in: [...context.developmentAccess] } };
}

/** Checagem pós-fetch pra um registro único já carregado — "esse developmentId está no escopo do usuário?". Use pra decidir entre seguir normalmente ou tratar como "não encontrado". */
export function canAccessDevelopment(context: AccessContext, developmentId: string | null | undefined) {
  if (context.developmentAccess === "ALL") return true;
  if (!developmentId) return true; // entidade sem empreendimento (ex.: cadastro geral da organização) não é restringível por empreendimento
  return context.developmentAccess.has(developmentId);
}
