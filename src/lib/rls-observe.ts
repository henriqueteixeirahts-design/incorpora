// Semana de observação do RLS (Pilar 2, Etapa 4 — preparada em 2026-11-08,
// DESLIGADA por padrão). Com `RLS_OBSERVE=1` na Vercel, toda consulta do
// Prisma a uma tabela que vai ganhar policy, feita SEM organização no
// contexto, vira uma linha de log — sem bloquear nada, sem mudar resultado.
// Cada uma dessas consultas é uma que a policy faria devolver "nada" (ou
// recusar a escrita) quando a Etapa 4 ligar: é a lista do que corrigir
// antes, achada de graça em produção.
//
// Log deduplicado por (model, operação, ponto de chamada) — a primeira
// ocorrência de cada combinação, não uma linha por consulta.
//
// Fora da observação, de propósito (docs/RLS_INVENTARIO_TIERS.md,
// "Exceções"): catálogo global sem RLS (`Permission`), a própria fronteira
// (`Organization`), usuário (vinculado por `AccessGrant`), papéis de
// sistema com organização nula (`Role`, `RolePermission`) e `JobRun`
// (batimento do despacho de alerta e watchdog sem organização). SQL bruto
// também fica de fora — os únicos usos são `list_active_org_ids()` e
// `resolve_user_organization()`, funções SECURITY DEFINER feitas pra rodar
// sem contexto.

const EXCLUDED_MODELS = new Set(["Organization", "User", "Permission", "Role", "RolePermission", "JobRun"]);

const seen = new Set<string>();

export function isRlsObserveEnabled() {
  return process.env.RLS_OBSERVE === "1";
}

/** Primeira linha da pilha que aponta pro código do app (não pro Prisma nem pra este arquivo). */
function appCallSite(): string {
  const lines = (new Error().stack ?? "").split("\n").slice(1);
  const line = lines.find((l) => /src[\\/](server|app|lib)/.test(l) && !/rls-observe|lib[\\/]prisma\./.test(l));
  return (line ?? "desconhecido").trim().replace(/^at\s+/, "");
}

export function observeQueryWithoutOrg(model: string | undefined, operation: string, orgId: string | null) {
  if (orgId !== null || !model || EXCLUDED_MODELS.has(model) || !isRlsObserveEnabled()) return;
  const callSite = appCallSite();
  const key = `${model}|${operation}|${callSite}`;
  if (seen.has(key)) return;
  seen.add(key);
  console.warn(JSON.stringify({ event: "rls-observe-no-org", model, operation, callSite }));
}

/** Só pra testes: esquece o que já foi registrado. */
export function resetRlsObserveForTests() {
  seen.clear();
}
