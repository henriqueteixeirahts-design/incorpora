// Núcleo do despacho de alertas de falha de job — roda na Edge Function
// `job-alert-dispatch` (Supabase), chamada a cada 15 min pelo cron-job.org
// (gatilho principal) e pelo GitHub Actions (.github/workflows/job-alert-dispatch.yml).
// Independente da Vercel e do banco por desenho: nada aqui depende do runtime do
// Next.js nem de um cron da Vercel disparar (o incidente de 2026-09-02 era
// exatamente o cron/função da Vercel morrendo em silêncio).
//
// Sem dependência de runtime (nem Deno, nem Node): o banco e o envio HTTP
// entram por parâmetro — a Edge Function (index.ts) liga isso ao Postgres
// do próprio Supabase e ao `fetch` do Deno; os testes de integração
// (tests/integration/job-alert-dispatch.test.ts) ligam a um client `pg` e a
// um `fetch` falso.
//
// Único remetente de alerta do sistema: a aplicação só marca FAILURE (ver
// src/server/jobs.ts). A chave do Resend vive só nos segredos da Edge
// Function — nunca em tabela, nem no Vault, nem no repo.

export type DispatchDb = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

export type DispatchConfig = {
  resendApiKey?: string;
  to?: string;
  from?: string;
  environmentLabel?: string; // ex.: "produção", "staging" — aparece no assunto
};

export type DispatchResult = {
  pending: number;
  delivered: string[];
  failed: Array<{ jobRunId: string; reason: string }>;
};

type PendingRow = { id: string; jobName: string; organizationId: string | null; error: string | null };

// Teto por invocação: uma rajada de falhas não estoura o tempo da função;
// o resto sai na próxima rodada (15 min).
const MAX_ALERTS_PER_RUN = 50;

export async function dispatchPendingJobAlerts(
  db: DispatchDb,
  config: DispatchConfig,
  fetchImpl: typeof fetch,
): Promise<DispatchResult> {
  const pending = await db.query<PendingRow>(
    `SELECT id, "jobName", "organizationId", error
       FROM job_runs
      WHERE status = 'FAILURE' AND "alertSentAt" IS NULL AND NOT "alertSuppressed"
      ORDER BY "startedAt" ASC
      LIMIT ${MAX_ALERTS_PER_RUN}`,
  );

  const result: DispatchResult = { pending: pending.length, delivered: [], failed: [] };

  if (!config.resendApiKey || !config.to || !config.from) {
    // Não reserva nada: sem canal, tudo continua pendente e visível como tal.
    for (const row of pending) result.failed.push({ jobRunId: row.id, reason: "missing_email_config" });
    return result;
  }

  for (const row of pending) {
    // Reserva antes de enviar: duas invocações simultâneas nunca mandam o
    // mesmo alerta. Só quem reservou devolve a linha se a entrega falhar.
    const claimed = await db.query<{ id: string }>(
      `UPDATE job_runs SET "alertSentAt" = now() WHERE id = $1 AND "alertSentAt" IS NULL RETURNING id`,
      [row.id],
    );
    if (claimed.length === 0) continue;

    const reason = await sendViaResend(row, config, fetchImpl);
    if (reason === null) {
      result.delivered.push(row.id);
    } else {
      await db.query(`UPDATE job_runs SET "alertSentAt" = NULL WHERE id = $1`, [row.id]);
      result.failed.push({ jobRunId: row.id, reason });
    }
  }

  return result;
}

/**
 * Batimento do despacho: uma linha em job_runs por chamada autorizada
 * (jobName 'job-alert-dispatch', sem organização). A auditoria V7
 * (src/server/audit.ts) acusa se o último SUCCESS tiver mais de 1 hora —
 * é assim que um gatilho morto (GitHub Actions que não dispara, função fora
 * do ar) aparece. `alertSuppressed = true`: falha do próprio despacho é
 * avisada pelo GitHub Actions (job falho), nunca vira e-mail sobre si mesma
 * — senão um Resend quebrado geraria uma falha nova a cada rodada.
 */
export async function recordDispatchHeartbeat(
  db: DispatchDb,
  outcome: { success: boolean; summary: Record<string, unknown>; error?: string },
): Promise<void> {
  await db.query(
    `INSERT INTO job_runs (id, "jobName", "organizationId", status, "triggeredBy", "startedAt", "finishedAt", summary, error, "alertSuppressed")
     VALUES (gen_random_uuid(), 'job-alert-dispatch', NULL, $1, 'CRON', now(), now(), $2::jsonb, $3, true)`,
    [outcome.success ? "SUCCESS" : "FAILURE", JSON.stringify(outcome.summary), outcome.error ?? null],
  );
}

/**
 * Canal de e-mail sem configuração na função: configuração PENDENTE (nunca
 * houve despacho bem-sucedido — o primeiro batimento SUCCESS é o marco) ou
 * QUEBRA (já funcionou e parou: segredo apagado, projeto recriado). A
 * resposta HTTP muda com isso: 503 (o workflow trata como configuração, no
 * máximo 1 falha/dia) ou 500 (falha real, em toda execução). Decisão de
 * 2026-11-08.
 */
export async function classifyMissingEmailConfig(db: DispatchDb): Promise<"pending_setup" | "broken"> {
  const [row] = await db.query<{ ever: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM job_runs
        WHERE "jobName" = 'job-alert-dispatch' AND "organizationId" IS NULL AND status = 'SUCCESS'
     ) AS ever`,
  );
  return row?.ever ? "broken" : "pending_setup";
}

export type StalenessProblem =
  | { kind: "old_pending_alert"; jobRunId: string; jobName: string; minutes: number }
  | { kind: "dispatch_gap"; minutes: number }
  | { kind: "job_overdue"; organizationId: string; jobName: string; lastSuccessAt: string | null };

// Janelas do vigia de atraso (decisão de 2026-11-08: o vigia mora na Edge
// Function, fora da Vercel, do banco e do GitHub — se a Vercel morrer, o
// cron diário não roda e a auditoria V7 nunca é avaliada; aqui não).
export const STALENESS_WINDOWS = {
  pendingAlertMinutes: 60, // alerta que continua sem entrega depois de 1h
  dispatchGapMinutes: 60, // intervalo entre dois despachos bem-sucedidos
  jobs: [
    { jobName: "recalculate-installments", maxHours: 26 }, // diário (03:00 UTC) + folga
    { jobName: "sync-index-values", maxHours: 8 * 24 }, // semanal (segunda 04:00 UTC) + folga
  ],
} as const;

/**
 * Vigia de atraso. Rodada na própria Edge Function a cada chamada — se
 * achar qualquer problema, a função responde erro e quem a chamou (o
 * cron-job.org, por e-mail próprio; o GitHub Actions) avisa. Três sinais:
 * - alerta pendente antigo (FAILURE sem entrega há mais de 1h, depois da
 *   tentativa de entrega desta mesma chamada);
 * - buraco no gatilho: o despacho bem-sucedido ANTERIOR a esta chamada tem
 *   mais de 1h (um dos agendadores parou); ignorado enquanto nunca houve
 *   despacho bem-sucedido (configuração inicial);
 * - job sem execução bem-sucedida dentro da janela, por organização ativa
 *   (o cron da Vercel morreu — exatamente o incidente de 2026-09-02).
 * Chamar ANTES de gravar o batimento desta execução.
 */
export async function evaluateStaleness(db: DispatchDb): Promise<StalenessProblem[]> {
  const problems: StalenessProblem[] = [];

  const oldPending = await db.query<{ id: string; jobName: string; minutes: number }>(
    `SELECT id, "jobName", floor(extract(epoch FROM now() - coalesce("finishedAt", "startedAt")) / 60)::int AS minutes
       FROM job_runs
      WHERE status = 'FAILURE' AND "alertSentAt" IS NULL AND NOT "alertSuppressed"
        AND coalesce("finishedAt", "startedAt") < now() - make_interval(mins => $1)
      ORDER BY "startedAt" ASC
      LIMIT 20`,
    [STALENESS_WINDOWS.pendingAlertMinutes],
  );
  for (const row of oldPending) {
    problems.push({ kind: "old_pending_alert", jobRunId: row.id, jobName: row.jobName, minutes: row.minutes });
  }

  const [gap] = await db.query<{ minutes: number | null }>(
    `SELECT floor(extract(epoch FROM now() - max("startedAt")) / 60)::int AS minutes
       FROM job_runs
      WHERE "jobName" = 'job-alert-dispatch' AND "organizationId" IS NULL AND status = 'SUCCESS'`,
  );
  if (gap?.minutes != null && gap.minutes > STALENESS_WINDOWS.dispatchGapMinutes) {
    problems.push({ kind: "dispatch_gap", minutes: gap.minutes });
  }

  for (const job of STALENESS_WINDOWS.jobs) {
    const overdue = await db.query<{ organizationId: string; lastSuccessAt: string | null }>(
      `SELECT o.id AS "organizationId",
              (SELECT max(r."startedAt") FROM job_runs r
                WHERE r."organizationId" = o.id AND r."jobName" = $1 AND r.status = 'SUCCESS')::text AS "lastSuccessAt"
         FROM organizations o
        WHERE o."isActive"
          AND NOT EXISTS (
            SELECT 1 FROM job_runs r
             WHERE r."organizationId" = o.id AND r."jobName" = $1 AND r.status = 'SUCCESS'
               AND r."startedAt" >= now() - make_interval(hours => $2)
          )`,
      [job.jobName, job.maxHours],
    );
    for (const row of overdue) {
      problems.push({ kind: "job_overdue", organizationId: row.organizationId, jobName: job.jobName, lastSuccessAt: row.lastSuccessAt });
    }
  }

  return problems;
}

/** `null` = entregue (Resend aceitou); senão, o motivo da falha. */
async function sendViaResend(row: PendingRow, config: DispatchConfig, fetchImpl: typeof fetch): Promise<string | null> {
  const label = config.environmentLabel ? ` (${config.environmentLabel})` : "";
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        to: config.to,
        subject: `[Incorpora${label}] Job "${row.jobName}" falhou`,
        text: `Job: ${row.jobName}\nJobRun: ${row.id}\nOrganização: ${row.organizationId ?? "-"}\nErro: ${row.error ?? "Falha sem mensagem de erro."}`,
      }),
    });
    return response.ok ? null : `resend_http_${response.status}`;
  } catch (error) {
    return `resend_request_failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}
