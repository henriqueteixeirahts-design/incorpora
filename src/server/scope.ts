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
