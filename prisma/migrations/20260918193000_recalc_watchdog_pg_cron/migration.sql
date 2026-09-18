-- Watchdog de JobRun travado (item 4 da correção do recalculate-installments,
-- docs/STATUS_IMPLANTACAO.md) — backstop independente do runtime da
-- aplicação. A varredura em src/server/jobs.ts (sweepStaleJobRuns) só roda
-- quando ALGUM job dispara de novo; se nada disparar por dias (ex.: cron
-- da Vercel parar de rodar por qualquer motivo), um JobRun ficaria RUNNING
-- pra sempre sem isso. pg_cron roda dentro do próprio Postgres, sem
-- depender do runtime da Vercel nenhuma vez.
--
-- Guardado atrás de um IF EXISTS em pg_available_extensions: pg_cron não
-- está disponível no Postgres genérico local/CI (confirmado — não é uma
-- extensão pré-instalada fora do Supabase), só no Supabase (staging/
-- produção). Sem essa guarda, esta migration quebraria replay do zero em
-- qualquer ambiente sem pg_cron — exatamente a classe de bug de
-- portabilidade documentada em CLAUDE.md (ALTER DEFAULT PRIVILEGES FOR
-- ROLE postgres da Etapa 2.5). Local/CI: no-op silencioso, sem extensão
-- nem job agendado. Supabase: habilita a extensão e agenda o watchdog.
--
-- Idempotente: reagendar (replay desta migration, ou uma migration futura
-- que precise recriar o job) remove o agendamento anterior antes de criar
-- o novo, em vez de falhar com nome de job duplicado.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'job-run-watchdog') THEN
      PERFORM cron.unschedule('job-run-watchdog');
    END IF;

    PERFORM cron.schedule(
      'job-run-watchdog',
      '*/15 * * * *',
      $cron$
        UPDATE job_runs
        SET status = 'FAILURE',
            "finishedAt" = now(),
            error = 'Execução travada — sem atualização de status há mais de 10 minutos (watchdog pg_cron, backstop independente do runtime da aplicação).'
        WHERE status = 'RUNNING' AND "startedAt" < now() - interval '10 minutes';
      $cron$
    );
  END IF;
END
$$;
