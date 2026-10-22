-- V7 da auditoria de atualização (2026-10-22): acusa quando o despacho de
-- alertas (GitHub Actions → Edge Function job-alert-dispatch) não registra
-- uma execução bem-sucedida há mais de 1 hora. "Um gatilho que morre
-- precisa aparecer em algum lugar": o próprio alerta não consegue avisar
-- que parou. Cada chamada da Edge Function grava um batimento em job_runs
-- (jobName 'job-alert-dispatch', sem organização, alertSuppressed = true —
-- falha do próprio despacho aparece no GitHub Actions, não vira e-mail
-- sobre si mesmo). Só acrescenta o valor ao enum — nenhuma mudança de grant.
ALTER TYPE "AuditCheckCode" ADD VALUE 'V7_ALERT_DISPATCH_HEARTBEAT';
