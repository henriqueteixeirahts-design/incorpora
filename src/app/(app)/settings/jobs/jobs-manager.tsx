"use client";

import { useState } from "react";
import Link from "next/link";
import { runJobAction } from "./actions";
import { formatDateTimeBR } from "@/lib/format";

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

const STATUS_CHIP_CLASS: Record<string, string> = {
  RUNNING: "inc-chip inc-chip--proposta",
  SUCCESS: "inc-chip inc-chip--contrato",
  FAILURE: "inc-chip inc-chip--atraso",
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
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
      <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" disabled={busy} onClick={handleClick}>
        {busy ? "Executando..." : "Executar agora"}
      </button>
      {message ? (
        <span
          style={{ fontSize: "12px", opacity: 0.85, maxWidth: 260, textAlign: "right" }}
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
      <div className="inc-card">
        <div className="inc-card__head">
          <div className="inc-card__title">Catálogo de jobs</div>
        </div>
        <div className="inc-card__body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {jobs.map((job) => (
            <div
              key={job.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "16px",
                padding: "12px",
                border: "1px solid var(--inc-border-card)",
                borderRadius: "var(--inc-radius-2)",
              }}
            >
              <div>
                <strong>{job.label}</strong>
                <p style={{ fontSize: "13px", color: "var(--inc-text-soft)", marginTop: "4px", maxWidth: 480 }}>
                  {job.description}
                </p>
              </div>
              <RunJobButton jobName={job.name} canRun={canRun} />
            </div>
          ))}
        </div>
      </div>

      <div className="inc-card" style={{ marginTop: "var(--inc-space-10)" }}>
        <div className="inc-card__head" style={{ flexWrap: "wrap", gap: "10px" }}>
          <div className="inc-card__title">Histórico de execuções</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <Link href={filterLink("")}>
              <button type="button" className={`inc-btn inc-btn--sm ${jobNameFilter ? "inc-btn--secondary" : "inc-btn--primary"}`}>
                Todos
              </button>
            </Link>
            {jobs.map((job) => (
              <Link key={job.name} href={filterLink(job.name)}>
                <button
                  type="button"
                  className={`inc-btn inc-btn--sm ${jobNameFilter === job.name ? "inc-btn--primary" : "inc-btn--secondary"}`}
                >
                  {job.label}
                </button>
              </Link>
            ))}
          </div>
          <span className="inc-card__meta">
            {total} execuç{total === 1 ? "ão" : "ões"}
          </span>
        </div>

        <table className="inc-table" style={{ border: 0 }}>
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
                <td colSpan={6} className="is-empty">
                  Nenhuma execução registrada ainda.
                </td>
              </tr>
            ) : null}
            {jobRuns.map((run) => {
              const durationMs = run.finishedAt ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime() : null;
              return (
                <tr key={run.id}>
                  <td className="is-key">{jobs.find((j) => j.name === run.jobName)?.label ?? run.jobName}</td>
                  <td>
                    <span className={STATUS_CHIP_CLASS[run.status] ?? "inc-chip inc-chip--permuta"}>
                      {STATUS_LABELS[run.status] ?? run.status}
                    </span>
                  </td>
                  <td className="is-muted">{TRIGGER_LABELS[run.triggeredBy] ?? run.triggeredBy}</td>
                  <td className="is-muted">{formatDateTimeBR(run.startedAt)}</td>
                  <td className="is-muted">{durationMs !== null ? `${(durationMs / 1000).toFixed(1)}s` : "—"}</td>
                  <td style={{ maxWidth: 360 }}>
                    {run.status === "FAILURE" ? (
                      <span className="error-text">{run.error ?? "Falha sem detalhe registrado."}</span>
                    ) : (
                      <span className="is-muted" style={{ fontSize: "13px" }}>{summaryText(run.summary)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="inc-table-foot">
          Página {page} de {totalPages}
          <div className="inc-pagination">
            {page > 1 ? (
              <Link href={pageLink(page - 1)}>← Anterior</Link>
            ) : (
              <span style={{ color: "var(--inc-text-placeholder)" }}>← Anterior</span>
            )}
            {page < totalPages ? (
              <Link href={pageLink(page + 1)}>Próxima →</Link>
            ) : (
              <span style={{ color: "var(--inc-text-placeholder)" }}>Próxima →</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
