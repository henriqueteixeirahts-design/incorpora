// Edge Function `job-alert-dispatch` (Supabase, Deno). Chamada a cada 15
// min pelo cron-job.org (gatilho principal) e pelo workflow do GitHub
// Actions .github/workflows/job-alert-dispatch.yml (em paralelo — chamada
// repetida não duplica e-mail). Gatilhos fora da Vercel e fora do banco
// (pg_net recusado em 2026-10-22, ver docs/STATUS_IMPLANTACAO.md). Entrega
// os alertas de falha de job pendentes e vigia atrasos — ver dispatch.ts.
//
// Segredos da função (Supabase → Edge Functions → Secrets — NUNCA no banco
// nem no repo):
//   JOB_ALERT_DISPATCH_TOKEN  mesmo valor no GitHub Secrets e no cron-job.org
//   RESEND_API_KEY            chave de envio do Resend
//   JOB_ALERT_EMAIL_TO        destinatário do alerta
//   JOB_ALERT_EMAIL_FROM      remetente (domínio verificado no Resend)
//   JOB_ALERT_ENV_LABEL       opcional — "produção", "staging"
// SUPABASE_DB_URL é injetada pelo próprio Supabase em toda Edge Function.
//
// Deploy sem verificação de JWT (os agendadores não têm JWT de usuário):
// a autorização é o token acima, comparado em tempo constante.
//
// Nunca falha em silêncio — quem chamou falha e avisa por e-mail:
//   200  tudo em dia
//   502  alerta não entregue (Resend recusou)
//   500  atraso detectado (job parado, buraco no gatilho, alerta antigo sem
//        entrega), canal de e-mail que já funcionou e parou, ou erro interno
//   503  canal de e-mail ainda não configurado (nunca houve despacho
//        bem-sucedido) — o workflow trata como configuração, 1 falha/dia
import postgres from "npm:postgres@3.4.5";
import { classifyMissingEmailConfig, dispatchPendingJobAlerts, evaluateStaleness, recordDispatchHeartbeat } from "./dispatch.ts";

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
      // Configuração pendente (nunca funcionou) = 503, o workflow falha no
      // máximo 1x/dia. Já funcionou e parou = quebra = 500, falha sempre.
      const kind = await classifyMissingEmailConfig(db);
      console.error(JSON.stringify({ event: "job-alert-dispatch-misconfigured", kind }));
      await recordDispatchHeartbeat(db, { success: false, summary: { kind }, error: "missing_email_config" });
      return kind === "broken"
        ? Response.json({ error: "email_config_lost" }, { status: 500 })
        : Response.json({ error: "missing_email_config" }, { status: 503 });
    }

    const result = await dispatchPendingJobAlerts(db, config, fetch);
    // Vigia de atraso: antes de gravar o batimento desta execução (o buraco
    // no gatilho é medido contra o despacho bem-sucedido ANTERIOR).
    const stale = await evaluateStaleness(db);
    // Só contagens, ids opacos e nomes de job — o log do Actions é público num repo público.
    const body = { pending: result.pending, delivered: result.delivered.length, failed: result.failed, stale };
    const delivered = result.failed.length === 0;
    await recordDispatchHeartbeat(db, {
      success: delivered,
      summary: body,
      error: delivered ? undefined : "alerta(s) não entregue(s)",
    });
    console.log(JSON.stringify({ event: "job-alert-dispatch", ...body }));
    // 502 = alerta não entregue; 500 = atraso detectado (job parado, gatilho
    // com buraco, alerta antigo sem entrega); 200 = tudo em dia.
    return Response.json(body, { status: !delivered ? 502 : stale.length > 0 ? 500 : 200 });
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
