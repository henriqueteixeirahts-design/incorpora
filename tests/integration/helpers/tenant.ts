import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { withOrgContext } from "@/lib/tenant-context";

/**
 * Preparação da Etapa 4 do RLS (2026-11-08) — dados de teste com policy ativa.
 *
 * Hoje os testes de integração criam e apagam fixtures pelo `prisma` do app
 * (conexão `app_user`) SEM organização no contexto. Quando um grupo de
 * tabelas ganhar policy, isso quebra de dois jeitos: o insert falha no
 * WITH CHECK e o código testado não enxerga o que o teste criou. Migração
 * grupo a grupo, junto da ativação de cada grupo:
 *
 * - `asOrg(orgId, fn)`: roda o código testado (e as leituras de conferência)
 *   dentro do contexto da organização — exatamente como a requisição real,
 *   onde `getAccessContext` define o contexto antes de qualquer query.
 * - `fixturePrisma`: conexão separada, como a role de migrations
 *   (`DIRECT_URL`, a mesma que o CI usa pra `prisma migrate deploy`), só
 *   pra montar e desmontar fixtures de várias organizações sem passar pela
 *   policy. NUNCA pra exercitar o código testado — esse precisa rodar como
 *   `app_user`, senão o teste de RLS dá falso verde.
 */
export function asOrg<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
  return withOrgContext(organizationId, fn);
}

let fixtureClient: PrismaClient | undefined;

export function fixturePrisma(): PrismaClient {
  if (!process.env.DIRECT_URL) {
    throw new Error("DIRECT_URL ausente — fixturePrisma precisa da conexão da role de migrations (a mesma do CI).");
  }
  fixtureClient ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });
  return fixtureClient;
}
