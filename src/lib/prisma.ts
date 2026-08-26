import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { getCurrentOrgId } from "@/lib/tenant-context";

const globalForPrisma = globalThis as unknown as {
  prismaBase: PrismaClient | undefined;
};

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const base = globalForPrisma.prismaBase ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaBase = base;
}

const NO_ORG_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

function currentOrgIdOrPlaceholder() {
  // Sem organização no contexto → placeholder que não bate com nenhum UUID
  // real. Nunca deixa de setar nada "pra não travar" — ausência de contexto
  // tem que dar zero linhas com RLS ativo (fail-closed), nunca abrir tudo
  // por omissão.
  return getCurrentOrgId() ?? NO_ORG_PLACEHOLDER;
}

/**
 * Marca "já estou dentro de uma transação que a extensão já preparou com
 * SET LOCAL" — evita que `$allOperations` abra uma SEGUNDA transação (via
 * `base.$transaction([...])`) por cima de uma já aberta pelo override de
 * `$transaction` abaixo, o que quebraria a atomicidade (cada operação
 * comitando sozinha em vez de fazer parte da transação real do chamador).
 * Achado num spike antes de codar: a primeira versão desta extensão (sem
 * este flag) passava em todos os testes de "o valor certo aparece", mas
 * quebrava silenciosamente o rollback de `prisma.$transaction(async tx =>
 * {...})` — uma criação sobrevivia mesmo depois de um erro lançado dentro da
 * mesma transação. Nunca subiu pra produção; pego antes de qualquer commit.
 */
const insidePrimedTransaction = new AsyncLocalStorage<boolean>();

/**
 * RLS (docs/ESPEC_MULTITENANT_FUNDACOES.md, Pilar 2) — toda query passa a
 * setar `app.current_org_id` (via `SELECT set_config(..., TRUE)`, escopo de
 * transação) antes de rodar, na MESMA transação física da query real —
 * obrigatório com o pooler de produção em modo transação (porta 6543): um
 * `SET` de sessão simples vazaria entre organizações diferentes quando a
 * conexão física é reciclada.
 *
 * Duas peças, porque uma chamada isolada (`prisma.customer.findMany()`) e
 * uma transação interativa (`prisma.$transaction(async tx => {...})`, o
 * padrão de quase toda mutação do app, sempre com `recordAuditEvent` junto)
 * precisam de tratamento diferente pra não quebrar atomicidade:
 *
 * - `client.$transaction` — intercepta a chamada de `$transaction` em si
 *   (forma callback OU array) e injeta o SET LOCAL como a PRIMEIRA operação
 *   da transação real do chamador — nunca uma transação separada.
 * - `query.$allOperations` — só entra em ação pra chamadas FORA de uma
 *   transação já preparada pelo item acima (senão dá dupla-transação e
 *   quebra rollback — ver o comentário do flag acima). Usa a forma array de
 *   `$transaction([...])` pra garantir a mesma conexão física.
 */
type TransactionOptions = { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel };

// Implementação solta (args dinâmicos), com o tipo real do `$transaction`
// sobrecarregado do client BASE aplicado via `as` — é o único jeito de
// sobrescrever um método sobrecarregado do Prisma sem reescrever à mão os
// tipos internos dele (`ITXClientDenyList` etc.), e é o que preserva a
// tipagem forte de `tx` em todo `prisma.$transaction(async tx => ...)` do
// app — sem isso, TypeScript perde a sobrecarga e todo `tx` vira `any`.
const $transaction = ((...txArgs: unknown[]) => {
  const orgId = currentOrgIdOrPlaceholder();
  const [first, options] = txArgs as [unknown, TransactionOptions | undefined];

  if (typeof first === "function") {
    const userCallback = first as (tx: unknown) => Promise<unknown>;
    const primed = async (tx: unknown) => {
      await (tx as { $executeRawUnsafe: typeof base.$executeRawUnsafe }).$executeRawUnsafe(
        `SELECT set_config('app.current_org_id', $1, TRUE)`,
        orgId,
      );
      return insidePrimedTransaction.run(true, () => userCallback(tx));
    };
    return base.$transaction(primed, options);
  }

  // Forma array — sem callback pra "primar" antes; prepende o próprio
  // SET LOCAL como primeiro item do array e descarta o resultado dele.
  const statements = first as Prisma.PrismaPromise<unknown>[];
  return base
    .$transaction([base.$executeRawUnsafe(`SELECT set_config('app.current_org_id', $1, TRUE)`, orgId), ...statements], options)
    .then((results) => (results as unknown[]).slice(1));
}) as typeof base.$transaction;

// `as unknown as typeof base` — a extensão não adiciona nem muda a forma
// pública do client (só intercepta `$transaction` e as operações por
// baixo), mas se o TypeScript tentar recomputar o tipo completo da
// extensão ele estoura profundidade de pilha (o `$transaction` sobrescrito
// acima, com sua assinatura sobrecarregada completa, vaza pro `InternalArgs`
// e se propaga por todo `*Args<...>` gerado). Como o formato real em
// runtime é idêntico ao client base, é seguro tipar `prisma` como `typeof
// base` diretamente — sem isso, `tsc` trava em "Excessive stack depth" em
// arquivos que nem tocam nesta extensão.
export const prisma = base.$extends({
  name: "rls-tenant-context",
  client: { $transaction },
  query: {
    $allOperations({ args, query }) {
      if (insidePrimedTransaction.getStore()) {
        return query(args);
      }
      const orgId = currentOrgIdOrPlaceholder();
      return base
        .$transaction([base.$executeRawUnsafe(`SELECT set_config('app.current_org_id', $1, TRUE)`, orgId), query(args)])
        .then(([, result]) => result);
    },
  },
}) as unknown as typeof base;

/**
 * Tipo de `tx` dentro de `prisma.$transaction(async (tx) => {...})`.
 * Substitui `Prisma.TransactionClient` em toda função auxiliar que recebe
 * `tx` como parâmetro — reexportado daqui (em vez de usado direto) pra toda
 * chamada continuar passando pelo `prisma` desta extensão, nunca pelo
 * client `base` sem RLS.
 */
export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
