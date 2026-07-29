"use client";

import { useState } from "react";
import Link from "next/link";
import { runJobAction } from "./actions";

export type JobCatalogEntry = { name: string; label: string; description: string };

export type JobRunRow = {
  id: string;
  jobName: string;
  status: string;
  triggeredBy: string;
  startedAt: Date;
  finishedAt: Date | null;
  summary: unknown;
  error: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  RUNNING: "Rodando...",
  SUCCESS: "Sucesso",
  FAILURE: "Falha",
};

const STATUS_COLORS: Record<string, string> = {
  RUNNING: "var(--text-muted, #666)",
  SUCCESS: "var(--success-color, #15803d)",
  FAILURE: "var(--danger-color, #b91c1c)",
};

const TRIGGER_LABELS: Record<string, string> = {
  CRON: "Automático (cron)",
  MANUAL: "Manual",
  EVENT: "Evento",
};

function RunJobButton({ jobName, canRun }: { jobName: string; canRun: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setMessage(null);
    const result = await runJobAction(jobName);
    setBusy(false);
    setMessage(result.error ?? "Executado com sucesso.");
  }

  if (!canRun) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "flex-end" }}>
      <button type="button" disabled={busy} onClick={handleClick}>
        {busy ? "Executando..." : "Executar agora"}
      </button>
      {message ? (
        <span
          style={{ fontSize: "0.78rem", opacity: 0.85, maxWidth: 260, textAlign: "right" }}
          className={message.includes("sucesso") ? undefined : "error-text"}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}

function summaryText(summary: unknown): string {
  if (!summary || typeof summary !== "object") return "—";
  try {
    return Object.entries(summary as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
      .join(" · ");
  } catch {
    return "—";
  }
}

export function JobsManager({
  jobs,
  jobRuns,
  total,
  page,
  totalPages,
  jobNameFilter,
  canRun,
}: {
  jobs: JobCatalogEntry[];
  jobRuns: JobRunRow[];
  total: number;
  page: number;
  totalPages: number;
  jobNameFilter: string;
  canRun: boolean;
}) {
  function filterLink(jobName: string) {
    const qs = new URLSearchParams();
    if (jobName) qs.set("job", jobName);
    return `/settings/jobs?${qs.toString()}`;
  }

  function pageLink(targetPage: number) {
    const qs = new URLSearchParams();
    if (jobNameFilter) qs.set("job", jobNameFilter);
    qs.set("page", String(targetPage));
    return `/settings/jobs?${qs.toString()}`;
  }

  return (
    <>
      <div className="field-section" style={{ marginTop: "1.5rem" }}>
        <h3>Catálogo de jobs</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {jobs.map((job) => (
            <div
              key={job.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "1rem",
                padding: "0.75rem",
                border: "1px solid var(--border-color)",
                borderRadius: 8,
              }}
            >
              <div>
                <strong>{job.label}</strong>
                <p style={{ fontSize: "0.85rem", opacity: 0.75, marginTop: "0.25rem", maxWidth: 480 }}>
                  {job.description}
                </p>
              </div>
              <RunJobButton jobName={job.name} canRun={canRun} />
            </div>
          ))}
        </div>
      </div>

      <div className="field-section" style={{ marginTop: "2rem" }}>
        <h3>Histórico de execuções</h3>

        <div className="list-toolbar">
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link href={filterLink("")}>
              <button type="button" className={jobNameFilter ? "secondary" : undefined}>
                Todos
              </button>
            </Link>
            {jobs.map((job) => (
              <Link key={job.name} href={filterLink(job.name)}>
                <button type="button" className={jobNameFilter === job.name ? undefined : "secondary"}>
                  {job.label}
                </button>
              </Link>
            ))}
          </div>
          <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
            {total} execuç{total === 1 ? "ão" : "ões"}
          </p>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Status</th>
              <th>Disparo</th>
              <th>Início</th>
              <th>Duração</th>
              <th>Resumo / erro</th>
            </tr>
          </thead>
          <tbody>
            {jobRuns.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ opacity: 0.7 }}>
                  Nenhuma execução registrada ainda.
                </td>
              </tr>
            ) : null}
            {jobRuns.map((run) => {
              const durationMs = run.finishedAt ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime() : null;
              return (
                <tr key={run.id}>
                  <td>{jobs.find((j) => j.name === run.jobName)?.label ?? run.jobName}</td>
                  <td style={{ color: STATUS_COLORS[run.status], fontWeight: 500 }}>
                    {STATUS_LABELS[run.status] ?? run.status}
                  </td>
                  <td>{TRIGGER_LABELS[run.triggeredBy] ?? run.triggeredBy}</td>
                  <td>{new Date(run.startedAt).toLocaleString("pt-BR")}</td>
                  <td>{durationMs !== null ? `${(durationMs / 1000).toFixed(1)}s` : "—"}</td>
                  <td style={{ maxWidth: 360 }}>
                    {run.status === "FAILURE" ? (
                      <span className="error-text">{run.error ?? "Falha sem detalhe registrado."}</span>
                    ) : (
                      <span style={{ fontSize: "0.85rem" }}>{summaryText(run.summary)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="pagination">
          {page > 1 ? <Link href={pageLink(page - 1)}>← Anterior</Link> : <span className="disabled">← Anterior</span>}
          <span>
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageLink(page + 1)}>Próxima →</Link>
          ) : (
            <span className="disabled">Próxima →</span>
          )}
        </div>
      </div>
    </>
  );
}
