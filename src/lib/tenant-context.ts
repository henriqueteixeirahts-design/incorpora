import { AsyncLocalStorage } from "node:async_hooks";

/**
 * RLS (docs/ESPEC_MULTITENANT_FUNDACOES.md, Pilar 2) — carrega o
 * `organizationId` da requisição atual pra fora de `requireAccessContext()`
 * sem precisar reestruturar as páginas/actions que já chamam
 * `const context = await requireAccessContext()` no topo da função.
 *
 * `enterWith` (não `.run()`) porque não há um único ponto que "envolve" a
 * requisição inteira no App Router — cada Server Component/Action já roda
 * como sua própria invocação isolada (o mesmo princípio que o próprio
 * Next.js usa pra `headers()`/`cookies()` funcionarem por requisição).
 *
 * Risco real, confirmado num spike antes de codar (não hipotético): se
 * código que chama `enterWith` for um FILHO de uma função que continua
 * rodando depois (ex.: um loop que itera várias organizações no mesmo
 * processo), o contexto do último filho vaza pra continuação do
 * orquestrador. É exatamente por isso que jobs administrativos (cron, seed)
 * NUNCA usam este mecanismo — usam uma conexão de banco separada com
 * `BYPASSRLS` (src/lib/prisma-service-role.ts), nunca um loop chamando
 * `enterWith` por organização.
 */
const orgContextStorage = new AsyncLocalStorage<string>();

export function setCurrentOrgId(organizationId: string) {
  orgContextStorage.enterWith(organizationId);
}

/** `null` quando nenhuma requisição setou contexto ainda — a extensão do Prisma trata isso como "sem organização" (fail-closed, nunca abre RLS por omissão). */
export function getCurrentOrgId(): string | null {
  return orgContextStorage.getStore() ?? null;
}
