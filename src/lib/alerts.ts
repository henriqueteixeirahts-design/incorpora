import "server-only";

/**
 * Canal de alerta real pra falha de job (docs/ESPEC_CONFIABILIDADE_JOBS_AUDITORIA.md).
 * `Notification` (prisma/schema.prisma) existe no schema mas não está
 * conectada a nenhuma tela nem canal — confirmado por grep, é código morto.
 * "Alerta que ninguém vê não conta": em vez de escrever numa tabela que
 * ninguém lê, este módulo tenta e-mail de verdade via Resend (API HTTP
 * simples, sem SDK novo) e, se as variáveis de ambiente necessárias não
 * estiverem configuradas, isso é reportado como falha de entrega — não
 * mascarado como sucesso.
 *
 * Requer, em produção: RESEND_API_KEY, JOB_ALERT_EMAIL_TO, JOB_ALERT_EMAIL_FROM.
 * Nenhuma dessas existe hoje (confirmado: nenhuma credencial de e-mail no
 * projeto) — até serem configuradas, todo alerta cai só no log da função
 * (visível em Vercel → Logs, não é uma notificação ativa).
 */
export type JobFailureAlert = {
  jobName: string;
  organizationId: string | null;
  jobRunId: string;
  error: string;
};

export async function sendJobFailureAlert(
  alert: JobFailureAlert,
): Promise<{ delivered: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.JOB_ALERT_EMAIL_TO;
  const from = process.env.JOB_ALERT_EMAIL_FROM;

  const logLine = `[job-alert] job="${alert.jobName}" jobRunId=${alert.jobRunId} organizationId=${alert.organizationId ?? "-"} error="${alert.error}"`;

  if (!apiKey || !to || !from) {
    console.error(
      `${logLine} — SEM CANAL DE ALERTA CONFIGURADO (RESEND_API_KEY/JOB_ALERT_EMAIL_TO/JOB_ALERT_EMAIL_FROM ausentes). Este alerta só existe neste log.`,
    );
    return { delivered: false, reason: "missing_email_config" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: `[Incorpora] Job "${alert.jobName}" falhou`,
        text: `Job: ${alert.jobName}\nJobRun: ${alert.jobRunId}\nOrganização: ${alert.organizationId ?? "-"}\nErro: ${alert.error}`,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`${logLine} — falha HTTP ${response.status} ao enviar via Resend: ${body}`);
      return { delivered: false, reason: `resend_http_${response.status}` };
    }

    return { delivered: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${logLine} — exceção ao chamar Resend: ${message}`);
    return { delivered: false, reason: "resend_request_failed" };
  }
}
