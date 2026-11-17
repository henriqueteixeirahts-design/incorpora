-- Alertas operacionais gravados no banco (2026-11-10, decisão do usuário).
--
-- Os eventos `prisma-global-client-in-transaction` (trava do cliente global
-- dentro de transação) e `login-org-resolution-failed` (login com vínculo e
-- organização nula) eram só log — e o log de execução da Vercel no plano
-- Hobby fica disponível por menos de 1 hora: "só no log" era invisível. Agora
-- viram uma linha em `job_runs` (`jobName = 'alerta:<evento>'`, FAILURE,
-- `triggeredBy = EVENT`, sem organização), que a corrente do alerta já
-- existente entrega por e-mail sem mudança na Edge Function.
--
-- Este índice é a deduplicação no banco: no máximo UMA linha por evento, por
-- ponto de chamada (`summary->>'callSite'`), por dia — também entre processos
-- diferentes (a gravação usa ON CONFLICT DO NOTHING). O teto por dia fica no
-- INSERT (src/lib/operational-alerts.ts). Só índice: nenhuma mudança de
-- privilégio, nenhum dado alterado.
CREATE UNIQUE INDEX "job_runs_operational_alert_dedup"
  ON "job_runs" ("jobName", (summary ->> 'callSite'), (("startedAt")::date))
  WHERE "jobName" LIKE 'alerta:%';
