"use client";

import { useState } from "react";
import Link from "next/link";
import { reverifyNowAction } from "./actions";

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

function StatusDot({ status }: { status: string }) {
  const color = status === "OK" ? "var(--success-color, #15803d)" : "var(--danger-color, #b91c1c)";
  return (
    <span
      title={status === "OK" ? "OK" : "ALERTA"}
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        backgroundColor: color,
        marginRight: "0.4rem",
      }}
    />
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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", alignItems: "flex-start", marginTop: "1rem" }}>
      <button type="button" disabled={busy} onClick={handleClick}>
        {busy ? "Verificando..." : "Re-verificar agora (completa)"}
      </button>
      {message ? (
        <span className={message.includes("problemas") ? "error-text" : undefined} style={{ fontSize: "0.85rem" }}>
          {message}
        </span>
      ) : null}
    </div>
  );
}

function CheckDetail({ check }: { check: AuditCheckRow }) {
  const issues = Array.isArray(check.issues) ? (check.issues as Record<string, unknown>[]) : [];
  return (
    <div style={{ padding: "0.75rem", border: "1px solid var(--border-color)", borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <strong>
          <StatusDot status={check.status} />
          {CHECK_LABELS[check.code] ?? check.code}
        </strong>
      </div>
      <p style={{ fontSize: "0.85rem", opacity: 0.8, marginTop: "0.35rem" }}>{summaryText(check.summary)}</p>
      {issues.length > 0 ? (
        <table className="data-table" style={{ marginTop: "0.5rem" }}>
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
                  <td key={key}>{String(issue[key] ?? "—")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {issues.length > 20 ? (
        <p style={{ fontSize: "0.8rem", opacity: 0.7, marginTop: "0.35rem" }}>
          Mostrando 20 de {issues.length} problema(s).
        </p>
      ) : null}
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
        <div className="field-section" style={{ marginTop: "1.5rem" }}>
          <h3>
            <StatusDot status={latest.status} />
            {latest.status === "OK" ? "Carteira íntegra" : "ATENÇÃO: verificação encontrou problema"} — verificada
            em {new Date(latest.startedAt).toLocaleString("pt-BR")}
          </h3>
          <ReverifyButton canRun={canRun} />
        </div>
      ) : (
        <p className="field-hint" style={{ marginTop: "1.5rem" }}>
          Nenhuma verificação rodou ainda.
          <ReverifyButton canRun={canRun} />
        </p>
      )}

      <div className="field-section" style={{ marginTop: "2rem" }}>
        <h3>Histórico de verificações</h3>
        <p style={{ fontSize: "0.85rem", opacity: 0.75, marginBottom: "0.75rem" }}>
          {total} verificaç{total === 1 ? "ão" : "ões"}
        </p>

        <table className="data-table">
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
                <td colSpan={5} style={{ opacity: 0.7 }}>
                  Nenhuma verificação registrada ainda.
                </td>
              </tr>
            ) : null}
            {auditRuns.map((run) => (
              <>
                <tr key={run.id}>
                  <td>
                    <StatusDot status={run.status} />
                    {run.status === "OK" ? "OK" : "Alerta"}
                  </td>
                  <td>{run.fullCheck ? "Completa" : "Amostragem"}</td>
                  <td>{TRIGGER_LABELS[run.triggeredBy] ?? run.triggeredBy}</td>
                  <td>{new Date(run.startedAt).toLocaleString("pt-BR")}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
                    >
                      {expandedId === run.id ? "Ocultar" : "Ver detalhe"}
                    </button>
                  </td>
                </tr>
                {expandedId === run.id ? (
                  <tr key={`${run.id}-detail`}>
                    <td colSpan={5}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", padding: "0.5rem 0" }}>
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
