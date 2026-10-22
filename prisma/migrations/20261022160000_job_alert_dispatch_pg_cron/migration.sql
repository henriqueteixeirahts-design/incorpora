-- Alerta de falha de job independente da Vercel (decisão de 2026-10-22,
-- docs/STATUS_IMPLANTACAO.md). O pg_cron, dentro do próprio Supabase, chama
-- a cada 15 min a Edge Function `job-alert-dispatch`
-- (supabase/functions/job-alert-dispatch), que entrega os alertas pendentes
-- em job_runs. Se a Vercel inteira parar — o cron dela morrer, a função
-- dela não subir —, o alerta ainda sai.
--
-- Por que Edge Function e não pg_net chamando o Resend direto: o pg_net
-- guarda cada requisição (com os headers) na tabela net.http_request_queue,
-- e no Supabase essa tabela é legível e gravável por PUBLIC (grant feito
-- por supabase_admin, que a role das migrations não consegue revogar). A
-- chave do Resend ficaria exposta ali. Com a Edge Function, a chave vive só
-- nos segredos da função; pela fila do pg_net passa apenas o token de
-- invocação, cujo único efeito é despachar alertas pendentes (sem duplicar).
--
-- EFEITO COLATERAL CONHECIDO (aprovado explicitamente antes de produção):
-- CREATE EXTENSION pg_net dispara o event trigger do Supabase
-- (grant_pg_net_access), que concede USAGE no schema net e EXECUTE em
-- net.http_post a PUBLIC/anon/authenticated/service_role — inclusive
-- app_user, por PUBLIC. A role das migrations não consegue revogar grants
-- de supabase_admin.
--
-- Nenhum GRANT/REVOKE aqui. A função de invocação fica no schema `ops`,
-- novo, sem USAGE pra nenhuma role além do dono (postgres) — app_user,
-- anon e authenticated não conseguem nem enxergá-la. O pg_cron roda como
-- postgres. URL e token da função ficam no Vault (legível só por postgres
-- e service_role). O token é gerado aqui mesmo, aleatório, e nunca sai do
-- banco a não ser no header da chamada (a Edge Function o lê do mesmo
-- Vault pra comparar). A URL é por ambiente, configurada fora do repo:
--   SELECT vault.create_secret('https://<ref>.supabase.co/functions/v1/job-alert-dispatch', 'job_alert_dispatch_url');
--
-- Guardado como a migration do watchdog: sem pg_net/pg_cron/Vault (local,
-- CI), é no-op.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_net;
  CREATE SCHEMA IF NOT EXISTS ops;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'job_alert_dispatch_token') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'job_alert_dispatch_token');
  END IF;

  CREATE OR REPLACE FUNCTION ops.invoke_job_alert_dispatch() RETURNS bigint
  LANGUAGE plpgsql
  AS $fn$
  DECLARE
    v_url text;
    v_token text;
  BEGIN
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'job_alert_dispatch_url';
    SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'job_alert_dispatch_token';
    IF v_url IS NULL OR v_token IS NULL THEN
      RAISE WARNING 'job-alert-dispatch: segredos job_alert_dispatch_url/job_alert_dispatch_token ausentes no Vault — nenhum alerta despachado';
      RETURN NULL;
    END IF;
    RETURN net.http_post(
      url := v_url,
      body := '{}'::jsonb,
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_token, 'Content-Type', 'application/json'),
      timeout_milliseconds := 30000
    );
  END;
  $fn$;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'job-alert-dispatch') THEN
    PERFORM cron.unschedule('job-alert-dispatch');
  END IF;
  -- Minuto 5, 20, 35, 50: sempre depois do watchdog (*/15), que fecha o
  -- JobRun travado como FAILURE — o despacho já encontra a falha marcada.
  PERFORM cron.schedule('job-alert-dispatch', '5-59/15 * * * *', 'SELECT ops.invoke_job_alert_dispatch()');
END
$$;
