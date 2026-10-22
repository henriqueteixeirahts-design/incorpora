-- Controle de entrega do alerta de falha de job (docs/STATUS_IMPLANTACAO.md,
-- Bloco 4 de 2026-10-22). Antes, o alerta só saía no instante em que a
-- própria aplicação marcava a falha — e o watchdog pg_cron
-- (20260918193000_recalc_watchdog_pg_cron), que roda a cada 15 min, marca o
-- JobRun travado como FAILURE em SQL puro, sem alerta. Como a varredura da
-- aplicação (sweepStaleJobRuns) só roda quando outro job dispara (no máximo
-- 1x/dia), ela chegava depois do pg_cron e não achava mais nada RUNNING:
-- job travado de verdade nunca gerava e-mail. Agora toda FAILURE sem
-- `alertSentAt` é alerta pendente, entregue na próxima varredura.
--
-- Só adiciona colunas (nenhuma mudança de grant: app_user já tem DML na
-- tabela inteira, coluna nova é coberta) e não mexe no job do pg_cron.
ALTER TABLE "job_runs" ADD COLUMN "alertSentAt" TIMESTAMP(3);
ALTER TABLE "job_runs" ADD COLUMN "alertSuppressed" BOOLEAN NOT NULL DEFAULT false;

-- Falhas anteriores a este controle (ex.: o travamento de 2026-09-02) não
-- viram uma rajada de e-mails retroativos no primeiro deploy.
UPDATE "job_runs" SET "alertSuppressed" = true WHERE "status" = 'FAILURE';
