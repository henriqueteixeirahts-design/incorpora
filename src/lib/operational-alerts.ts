/**
 * Alertas operacionais gravados no banco (2026-11-10) — decisão do usuário:
 * o log de execução da Vercel (plano Hobby) fica disponível por menos de 1
 * hora, então "só no log" é invisível. Dois eventos viram uma linha em
 * `job_runs`, que a corrente do alerta já entrega por e-mail:
 *   - `prisma-global-client-in-transaction` (trava de src/lib/prisma.ts);
 *   - `login-org-resolution-failed` (src/server/login-organization.ts).
 *
 * Formato da linha: `jobName = 'alerta:<evento>'`, status FAILURE,
 * `triggeredBy = EVENT`, sem organização, `summary = { event, callSite, ... }`,
 * `error` = mensagem legível (vai no e-mail).
 *
 * Três travas (testes em tests/integration/operational-alerts.test.ts):
 *   1. A gravação sai pelo CLIENTE BASE (quem cria o gravador em
 *      src/lib/prisma.ts passa `base.$executeRawUnsafe`), nunca pelo cliente
 *      estendido: gravar pela extensão de dentro da extensão seria laço.
 *   2. Disparar e esquecer: nunca lança nem rejeita; falha de gravação só
 *      vira um console.error. Quem chama não espera.
 *   3. Deduplicação e teto: uma linha por (evento, ponto de chamada, dia), no
 *      máximo `cap` pontos distintos por evento por dia + uma linha de
 *      "teto atingido". Em memória (evita ir ao banco a cada ocorrência) e no
 *      banco (índice único parcial, migration 20261110160000 — vale entre
 *      processos).
 * Só grava em produção (fora dela, a trava lança erro e o login registra no
 * console) — a não ser que `enabled` diga outra coisa (testes).
 */
export const OPERATIONAL_ALERT_JOB_PREFIX = "alerta:";
export const OPERATIONAL_ALERT_CAP_PER_DAY = 20;
export const OPERATIONAL_ALERT_OVERFLOW_CALL_SITE = "__teto__";

type Execute = (sql: string, ...params: unknown[]) => Promise<number>;

type RecorderOptions = {
  cap?: number;
  enabled?: () => boolean;
  now?: () => Date;
};

const INSERT_SQL = `
  INSERT INTO job_runs (id, "jobName", "organizationId", status, "triggeredBy", "startedAt", "finishedAt", summary, error)
  SELECT gen_random_uuid(), $1, NULL, 'FAILURE', 'EVENT', now(), now(), $2::jsonb, $3
   WHERE (SELECT count(*) FROM job_runs
           WHERE "jobName" = $1 AND ("startedAt")::date = (now())::date
             AND summary ->> 'callSite' <> '${OPERATIONAL_ALERT_OVERFLOW_CALL_SITE}') < $4
  ON CONFLICT DO NOTHING`;

const OVERFLOW_SQL = `
  INSERT INTO job_runs (id, "jobName", "organizationId", status, "triggeredBy", "startedAt", "finishedAt", summary, error)
  SELECT gen_random_uuid(), $1, NULL, 'FAILURE', 'EVENT', now(), now(), $2::jsonb, $3
   WHERE (SELECT count(*) FROM job_runs
           WHERE "jobName" = $1 AND ("startedAt")::date = (now())::date
             AND summary ->> 'callSite' <> '${OPERATIONAL_ALERT_OVERFLOW_CALL_SITE}') >= $4
  ON CONFLICT DO NOTHING`;

/** Mantém a função viva até a gravação terminar, quando roda na Vercel (mesmo mecanismo do `waitUntil` de @vercel/functions). */
function keepAlive(promise: Promise<unknown>) {
  try {
    const ctx = (globalThis as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined>)[
      Symbol.for("@vercel/request-context")
    ]?.get?.();
    ctx?.waitUntil?.(promise);
  } catch {
    // sem contexto da Vercel (testes, scripts): nada a fazer
  }
}

export function createOperationalAlertRecorder(execute: Execute, options: RecorderOptions = {}) {
  const cap = options.cap ?? OPERATIONAL_ALERT_CAP_PER_DAY;
  const seen = new Map<string, Set<string>>(); // "dia|evento" → pontos de chamada já enviados ao banco

  async function write(event: string, callSite: string, message: string, overflow: boolean) {
    const jobName = `${OPERATIONAL_ALERT_JOB_PREFIX}${event}`;
    const summary = JSON.stringify({ event, callSite, firstSeenAt: new Date().toISOString() });
    if (!overflow) {
      const inserted = await execute(INSERT_SQL, jobName, summary, message, cap);
      if (inserted > 0) return;
    }
    // Teto do dia já atingido no banco (por este ou por outro processo): uma linha de aviso, uma vez.
    await execute(
      OVERFLOW_SQL,
      jobName,
      JSON.stringify({ event, callSite: OPERATIONAL_ALERT_OVERFLOW_CALL_SITE, firstSeenAt: new Date().toISOString() }),
      `Teto de ${cap} pontos de chamada distintos por dia atingido para "${event}". Último: ${callSite}. ${message}`,
      cap,
    );
  }

  /** Disparar e esquecer: devolve uma promessa que nunca rejeita (para teste); quem chama não precisa esperar. */
  return function recordOperationalAlert(event: string, callSite: string, message: string): Promise<void> {
    try {
      if (!(options.enabled?.() ?? process.env.NODE_ENV === "production")) return Promise.resolve();
      const day = (options.now?.() ?? new Date()).toISOString().slice(0, 10);
      const key = `${day}|${event}`;
      for (const k of seen.keys()) if (!k.startsWith(`${day}|`)) seen.delete(k); // dias anteriores
      const sites = seen.get(key) ?? new Set<string>();
      seen.set(key, sites);
      if (sites.has(callSite) || sites.has(OPERATIONAL_ALERT_OVERFLOW_CALL_SITE)) return Promise.resolve();
      const overflow = sites.size >= cap;
      sites.add(overflow ? OPERATIONAL_ALERT_OVERFLOW_CALL_SITE : callSite);
      const promise = write(event, callSite, message, overflow).catch((error: unknown) => {
        try {
          console.error(
            JSON.stringify({ event: "operational-alert-write-failed", alert: event, callSite, error: error instanceof Error ? error.message : String(error) }),
          );
        } catch {
          // nunca propaga
        }
      });
      keepAlive(promise);
      return promise;
    } catch {
      return Promise.resolve();
    }
  };
}

/** Primeiro quadro da pilha fora da extensão do Prisma, deste módulo e de node_modules — o ponto de chamada a corrigir. */
export function callSiteFromStack(stack: string | undefined): string {
  const frame = (stack ?? "")
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .find((l) => l.startsWith("at ") && !/lib[\\/]prisma\.ts|operational-alerts|node_modules|node:internal|\(native\)|<anonymous>/.test(l));
  return frame ? frame.replace(/^at\s+/, "").slice(0, 300) : "desconhecido";
}
