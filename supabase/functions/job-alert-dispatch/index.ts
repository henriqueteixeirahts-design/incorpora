// Edge Function `job-alert-dispatch` (Supabase, Deno). Invocada pelo pg_cron
// a cada 15 min (migration 20261022160000_job_alert_dispatch_pg_cron), via
// pg_net, com um token próprio no header. Entrega os alertas de falha de
// job pendentes — ver dispatch.ts.
//
// Segredos da função (Supabase → Edge Functions → Secrets — NUNCA no banco):
//   RESEND_API_KEY            chave de envio do Resend
//   JOB_ALERT_EMAIL_TO        destinatário do alerta
//   JOB_ALERT_EMAIL_FROM      remetente (domínio verificado no Resend)
//   JOB_ALERT_ENV_LABEL       opcional — "produção", "staging"
// SUPABASE_DB_URL é injetada pelo próprio Supabase em toda Edge Function.
//
// Deploy sem verificação de JWT (o pg_cron não tem JWT de usuário). A
// autorização é o token `job_alert_dispatch_token` do Vault — gerado
// aleatoriamente pela própria migration, nunca manuseado por ninguém: o
// pg_cron o manda no header e a função o lê do mesmo Vault pra comparar,
// em tempo constante.
import postgres from "npm:postgres@3.4.5";
import { dispatchPendingJobAlerts } from "./dispatch.ts";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (request) => {
  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });
  try {
    const [secret] = await sql<{ token: string }[]>`
      SELECT decrypted_secret AS token FROM vault.decrypted_secrets WHERE name = 'job_alert_dispatch_token'`;
    const received = request.headers.get("authorization") ?? "";
    if (!secret?.token || !safeEqual(received, `Bearer ${secret.token}`)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const result = await dispatchPendingJobAlerts(
      { query: (text, params = []) => sql.unsafe(text, params as never[]) as never },
      {
        resendApiKey: Deno.env.get("RESEND_API_KEY"),
        to: Deno.env.get("JOB_ALERT_EMAIL_TO"),
        from: Deno.env.get("JOB_ALERT_EMAIL_FROM"),
        environmentLabel: Deno.env.get("JOB_ALERT_ENV_LABEL"),
      },
      fetch,
    );
    // Log estruturado (Supabase → Edge Functions → Logs) — nunca inclui a chave.
    console.log(JSON.stringify({ event: "job-alert-dispatch", ...result }));
    return Response.json(result);
  } catch (error) {
    console.error(JSON.stringify({ event: "job-alert-dispatch-error", message: error instanceof Error ? error.message : String(error) }));
    return new Response("dispatch failed", { status: 500 });
  } finally {
    await sql.end();
  }
});
