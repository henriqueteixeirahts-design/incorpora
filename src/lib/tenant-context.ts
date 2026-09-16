import { AsyncLocalStorage } from "node:async_hooks";

/**
 * RLS (docs/ESPEC_MULTITENANT_FUNDACOES.md, Pilar 2) — carrega o
 * `organizationId` da execução atual, pra `src/lib/prisma.ts` saber qual
 * `app.current_org_id` setar em cada transação. Duas formas de entrar,
 * cada uma certa pro seu chamador — nunca misturar:
 *
 * 1. `setCurrentOrgId` (usa `enterWith`) — `requireAccessContext()`
 *    (`src/server/auth-context.ts`) chama isso como último passo antes de
 *    devolver o `AccessContext`. `enterWith` (não `.run()`) porque não há
 *    um único ponto que "envolve" a requisição inteira no App Router —
 *    cada Server Component/Action já roda como sua própria invocação
 *    isolada (o mesmo princípio que o próprio Next.js usa pra
 *    `headers()`/`cookies()` funcionarem por requisição). Cada requisição
 *    é sua própria invocação de topo, então não há "continuação do
 *    orquestrador" pra vazar contexto.
 * 2. `withOrgContext` (usa `.run()`) — pra qualquer código que processa
 *    MAIS DE UMA organização na mesma invocação (ex.: `runJobForOrganization`
 *    dentro do loop de `runJobForAllOrganizations`, em
 *    `src/server/jobs.ts`). Aqui SIM existe uma continuação do
 *    orquestrador (o loop) depois de cada organização processada —
 *    `enterWith` vazaria o contexto da última organização pra próxima
 *    iteração (ou pro código depois do loop). `.run()` escopa o contexto
 *    só pela duração da função passada, sem esse risco — é por isso que
 *    jobs administrativos não precisam de uma conexão de banco separada
 *    só por causa de propagação de contexto: o problema é resolvido pelo
 *    mecanismo certo de `AsyncLocalStorage`, não contornado com bypass.
 */
const orgContextStorage = new AsyncLocalStorage<string>();

export function setCurrentOrgId(organizationId: string) {
  orgContextStorage.enterWith(organizationId);
}

/**
 * Roda `fn` com `organizationId` como contexto de tenant, escopado só à
 * duração de `fn` — seguro pra chamar em sequência ou em paralelo
 * (`Promise.all`) por várias organizações na mesma invocação, sem uma
 * vazar contexto pra outra nem pra continuação de quem chamou depois que
 * `fn` termina.
 */
export function withOrgContext<T>(organizationId: string, fn: () => T): T {
  return orgContextStorage.run(organizationId, fn);
}

/** `null` quando nenhuma requisição setou contexto ainda — a extensão do Prisma trata isso como "sem organização" (fail-closed, nunca abre RLS por omissão). */
export function getCurrentOrgId(): string | null {
  return orgContextStorage.getStore() ?? null;
}
