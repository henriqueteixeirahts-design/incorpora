// Núcleo do despacho de alertas de falha de job — roda na Edge Function
// `job-alert-dispatch` (Supabase), invocada pelo pg_cron a cada 15 min.
// Independente da Vercel por desenho: nada aqui depende do runtime do
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
// Function — nunca em tabela, nem no Vault.

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
