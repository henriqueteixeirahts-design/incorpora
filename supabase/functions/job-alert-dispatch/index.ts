// Edge Function `job-alert-dispatch` (Supabase, Deno). Chamada a cada 15
// min pelo workflow do GitHub Actions .github/workflows/job-alert-dispatch.yml
// — gatilho fora da Vercel e fora do banco (decisão de 2026-10-22: pg_net
// recusado, ver docs/STATUS_IMPLANTACAO.md). Entrega os alertas de falha de
// job pendentes — ver dispatch.ts.
//
// Segredos da função (Supabase → Edge Functions → Secrets — NUNCA no banco
// nem no repo):
//   JOB_ALERT_DISPATCH_TOKEN  mesmo valor do secret JOB_ALERT_DISPATCH_TOKEN do GitHub
//   RESEND_API_KEY            chave de envio do Resend
//   JOB_ALERT_EMAIL_TO        destinatário do alerta
//   JOB_ALERT_EMAIL_FROM      remetente (domínio verificado no Resend)
//   JOB_ALERT_ENV_LABEL       opcional — "produção", "staging"
// SUPABASE_DB_URL é injetada pelo próprio Supabase em toda Edge Function.
//
// Deploy sem verificação de JWT (o GitHub Actions não tem JWT de usuário):
// a autorização é o token acima, comparado em tempo constante.
//
// Nunca falha em silêncio: qualquer alerta não entregue, ou canal sem
// configuração (mesmo sem nada pendente), responde erro HTTP — o job do
// Actions falha e o GitHub notifica por e-mail.
import postgres from "npm:postgres@3.4.5";
import { dispatchPendingJobAlerts, recordDispatchHeartbeat } from "./dispatch.ts";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (request) => {
  const expected = Deno.env.get("JOB_ALERT_DISPATCH_TOKEN");
  const received = request.headers.get("authorization") ?? "";
  if (!expected || !safeEqual(received, `Bearer ${expected}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const config = {
    resendApiKey: Deno.env.get("RESEND_API_KEY"),
    to: Deno.env.get("JOB_ALERT_EMAIL_TO"),
    from: Deno.env.get("JOB_ALERT_EMAIL_FROM"),
    environmentLabel: Deno.env.get("JOB_ALERT_ENV_LABEL"),
  };

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });
  const db = { query: (text: string, params: unknown[] = []) => sql.unsafe(text, params as never[]) as never };
  try {
    if (!config.resendApiKey || !config.to || !config.from) {
      console.error(JSON.stringify({ event: "job-alert-dispatch-misconfigured" }));
      await recordDispatchHeartbeat(db, { success: false, summary: {}, error: "missing_email_config" });
      return Response.json({ error: "missing_email_config" }, { status: 500 });
    }

    const result = await dispatchPendingJobAlerts(db, config, fetch);
    // Só contagens e ids opacos — o log do Actions é público num repo público.
    const body = { pending: result.pending, delivered: result.delivered.length, failed: result.failed };
    const ok = result.failed.length === 0;
    await recordDispatchHeartbeat(db, { success: ok, summary: body, error: ok ? undefined : "alerta(s) não entregue(s)" });
    console.log(JSON.stringify({ event: "job-alert-dispatch", ...body }));
    return Response.json(body, { status: ok ? 200 : 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "job-alert-dispatch-error", message }));
    // Melhor esforço: se o próprio banco caiu, o GitHub Actions ainda falha.
    await recordDispatchHeartbeat(db, { success: false, summary: {}, error: message }).catch(() => undefined);
    return Response.json({ error: "dispatch_failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
});
