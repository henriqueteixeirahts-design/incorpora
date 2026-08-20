"use client";

import { useState } from "react";
import Link from "next/link";
import { reverifyNowAction } from "./actions";
import { formatDateTimeBR } from "@/lib/format";

export type AuditCheckRow = {
  id: string;
  code: string;
  status: string;
  summary: unknown;
  issues: unknown;
};

export type AuditRunRow = {
  id: string;
  status: string;
  triggeredBy: string;
  fullCheck: boolean;
  startedAt: Date;
  finishedAt: Date | null;
  checks: AuditCheckRow[];
};

const CHECK_LABELS: Record<string, string> = {
  V1_INDEX_FRESHNESS: "V1 — Frescor dos índices",
  V2_CORRECTION_COVERAGE: "V2 — Cobertura da correção",
  V3_MEMORY_CONSISTENCY: "V3 — Consistência da memória",
  V4_JOB_EXECUTION: "V4 — Execução dos jobs",
  V5_SOURCE_DIVERGENCE: "V5 — Divergência de fonte",
};

const CHECK_ORDER = ["V1_INDEX_FRESHNESS", "V2_CORRECTION_COVERAGE", "V3_MEMORY_CONSISTENCY", "V4_JOB_EXECUTION", "V5_SOURCE_DIVERGENCE"];

const TRIGGER_LABELS: Record<string, string> = {
  CRON: "Automático (cron)",
  MANUAL: "Manual",
  EVENT: "Evento",
};

function summaryText(summary: unknown): string {
  if (!summary || typeof summary !== "object") return "—";
  try {
    return Object.entries(summary as Record<string, unknown>)
      .filter(([key]) => key !== "checks")
      .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
      .join(" · ");
  } catch {
    return "—";
  }
}

function StatusPill({ status }: { status: string }) {
  const ok = status === "OK";
  return (
    <span className={`inc-pill ${ok ? "inc-pill--ok" : "inc-pill--warn"}`}>
      <span className="inc-pill__dot" />
      {ok ? "OK" : "Alerta"}
    </span>
  );
}

function ReverifyButton({ canRun }: { canRun: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setMessage(null);
    const result = await reverifyNowAction();
    setBusy(false);
    setMessage(result.error ?? "Verificação completa concluída sem problemas.");
  }

  if (!canRun) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start", marginTop: "14px" }}>
      <button type="button" className="inc-btn inc-btn--primary" disabled={busy} onClick={handleClick}>
        {busy ? "Verificando..." : "Re-verificar agora (completa)"}
      </button>
      {message ? (
        <span className={message.includes("problemas") ? "error-text" : "inc-help"} style={{ fontSize: "12.5px" }}>
          {message}
        </span>
      ) : null}
    </div>
  );
}

function CheckDetail({ check }: { check: AuditCheckRow }) {
  const issues = Array.isArray(check.issues) ? (check.issues as Record<string, unknown>[]) : [];
  return (
    <div className="inc-card">
      <div className="inc-card__head">
        <StatusPill status={check.status} />
        <span className="inc-card__title" style={{ fontSize: "13.5px" }}>
          {CHECK_LABELS[check.code] ?? check.code}
        </span>
      </div>
      <div className="inc-card__body" style={{ padding: "10px 16px" }}>
        <p style={{ margin: 0, fontSize: "12.5px", color: "var(--inc-text-secondary)" }}>{summaryText(check.summary)}</p>
        {issues.length > 0 ? (
          <table className="inc-table" style={{ marginTop: "10px", border: 0 }}>
            <thead>
              <tr>
                {Object.keys(issues[0]).map((key) => (
                  <th key={key}>{key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {issues.slice(0, 20).map((issue, index) => (
                <tr key={index}>
                  {Object.keys(issues[0]).map((key) => (
                    <td key={key} className="is-muted">
                      {String(issue[key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {issues.length > 20 ? (
          <p style={{ fontSize: "11.5px", color: "var(--inc-text-muted)", marginTop: "8px" }}>
            Mostrando 20 de {issues.length} problema(s).
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function AuditManager({
  auditRuns,
  total,
  page,
  totalPages,
  canRun,
}: {
  auditRuns: AuditRunRow[];
  total: number;
  page: number;
  totalPages: number;
  canRun: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(auditRuns[0]?.id ?? null);

  function pageLink(targetPage: number) {
    const qs = new URLSearchParams();
    qs.set("page", String(targetPage));
    return `/settings/audit?${qs.toString()}`;
  }

  const latest = auditRuns[0];

  return (
    <>
      {latest ? (
        <div className="inc-card" style={{ marginTop: "24px" }}>
          <div className="inc-card__body" style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <StatusPill status={latest.status} />
            <span style={{ fontSize: "14px", color: "var(--inc-text)" }}>
              {latest.status === "OK" ? "Carteira íntegra" : "Atenção: verificação encontrou problema"} — verificada
              em {formatDateTimeBR(latest.startedAt)}
            </span>
          </div>
          <div className="inc-card__body" style={{ paddingTop: 0 }}>
            <ReverifyButton canRun={canRun} />
          </div>
        </div>
      ) : (
        <div className="inc-card" style={{ marginTop: "24px" }}>
          <div className="inc-card__body">
            <p className="inc-help" style={{ margin: 0 }}>Nenhuma verificação rodou ainda.</p>
            <ReverifyButton canRun={canRun} />
          </div>
        </div>
      )}

      <div style={{ marginTop: "32px" }}>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Histórico de verificações</div>
        <p style={{ fontSize: "12.5px", color: "var(--inc-text-soft)", marginBottom: "12px" }}>
          {total} verificaç{total === 1 ? "ão" : "ões"}
        </p>

        <div className="inc-card">
          <table className="inc-table" style={{ border: 0 }}>
            <thead>
              <tr>
                <th>Status</th>
                <th>Tipo</th>
                <th>Disparo</th>
                <th>Início</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {auditRuns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="is-empty">
                    Nenhuma verificação registrada ainda.
                  </td>
                </tr>
              ) : null}
              {auditRuns.map((run) => (
                <>
                  <tr key={run.id}>
                    <td>
                      <StatusPill status={run.status} />
                    </td>
                    <td className="is-muted">{run.fullCheck ? "Completa" : "Amostragem"}</td>
                    <td className="is-muted">{TRIGGER_LABELS[run.triggeredBy] ?? run.triggeredBy}</td>
                    <td className="is-muted">{formatDateTimeBR(run.startedAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="inc-btn inc-btn--secondary inc-btn--sm"
                        onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
                      >
                        {expandedId === run.id ? "Ocultar" : "Ver detalhe"}
                      </button>
                    </td>
                  </tr>
                  {expandedId === run.id ? (
                    <tr key={`${run.id}-detail`}>
                      <td colSpan={5} style={{ background: "var(--inc-surface-subtle)" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "10px 0" }}>
                          {CHECK_ORDER.map((code) => {
                            const check = run.checks.find((c) => c.code === code);
                            return check ? <CheckDetail key={check.id} check={check} /> : null;
                          })}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              ))}
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
      </div>
    </>
  );
}
