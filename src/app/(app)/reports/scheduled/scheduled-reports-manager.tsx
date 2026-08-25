"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createScheduledReportAction,
  updateScheduledReportAction,
  deleteScheduledReportAction,
  markScheduledReportGeneratedAction,
  type FormState,
} from "./actions";
import { formatDateTimeBR } from "@/lib/format";

const PERIODICITY_LABELS: Record<string, string> = { WEEKLY: "Semanal", MONTHLY: "Mensal", QUARTERLY: "Trimestral" };

export type ScheduledReportRow = {
  id: string;
  name: string;
  reportKey: string;
  reportLabel: string;
  developmentId: string | null;
  developmentName: string | null;
  periodicity: string;
  recipients: string[];
  isActive: boolean;
  lastGeneratedAt: Date | null;
};

type ReportOption = { key: string; label: string };
type DevelopmentOption = { id: string; label: string };

const initialState: FormState = {};

function ScheduledReportForm({
  report,
  reportOptions,
  developments,
  onSaved,
  onCancel,
}: {
  report: ScheduledReportRow | null;
  reportOptions: ReportOption[];
  developments: DevelopmentOption[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const formAction = report ? updateScheduledReportAction : createScheduledReportAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={dispatch} className="field-section" style={{ marginTop: "0.75rem" }}>
      {report ? <input type="hidden" name="id" value={report.id} /> : null}
      <div className="field-grid">
        <div className="field">
          <label htmlFor="sr-name">Nome *</label>
          <input id="sr-name" name="name" required defaultValue={report?.name ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="sr-report">Relatório *</label>
          <select id="sr-report" name="reportKey" required defaultValue={report?.reportKey ?? ""}>
            <option value="" disabled>Selecione...</option>
            {reportOptions.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sr-development">Empreendimento</label>
          <select id="sr-development" name="developmentId" defaultValue={report?.developmentId ?? ""}>
            <option value="">Consolidado (organização)</option>
            {developments.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sr-periodicity">Periodicidade *</label>
          <select id="sr-periodicity" name="periodicity" required defaultValue={report?.periodicity ?? ""}>
            <option value="" disabled>Selecione...</option>
            <option value="WEEKLY">Semanal</option>
            <option value="MONTHLY">Mensal</option>
            <option value="QUARTERLY">Trimestral</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="sr-recipients">Destinatários (e-mails separados por vírgula)</label>
          <input id="sr-recipients" name="recipients" defaultValue={report?.recipients.join(", ") ?? ""} />
          <p className="field-hint">Cadastro apenas — o disparo automático por e-mail chega na Fase 2.</p>
        </div>
        {report ? (
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
            <input type="checkbox" name="isActive" defaultChecked={report.isActive} />
            Ativo
          </label>
        ) : null}
      </div>
      {state.error ? <p className="error-text">{state.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button type="submit" disabled={pending}>{pending ? "Salvando..." : "Salvar"}</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

export function ScheduledReportsManager({
  reports,
  reportOptions,
  developments,
  canEdit,
}: {
  reports: ScheduledReportRow[];
  reportOptions: ReportOption[];
  developments: DevelopmentOption[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<ScheduledReportRow | null | "new">(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(report: ScheduledReportRow) {
    if (!confirm(`Excluir o agendamento "${report.name}"?`)) return;
    setError(null);
    const result = await deleteScheduledReportAction(report.id);
    if (result.error) setError(result.error);
  }

  async function handleGenerateNow(report: ScheduledReportRow) {
    setError(null);
    const qs = new URLSearchParams({ key: report.reportKey, format: "xlsx" });
    if (report.developmentId) qs.set("developmentId", report.developmentId);
    window.open(`/api/reports/export?${qs.toString()}`, "_blank");
    const result = await markScheduledReportGeneratedAction(report.id);
    if (result.error) setError(result.error);
  }

  return (
    <div>
      {error ? <p className="error-text">{error}</p> : null}

      {reports.length === 0 ? (
        <p className="field-hint">Nenhum agendamento cadastrado.</p>
      ) : (
        <table className="inc-table" style={{ marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Relatório</th>
              <th>Empreendimento</th>
              <th>Periodicidade</th>
              <th>Destinatários</th>
              <th>Última geração</th>
              <th>Status</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id}>
                <td className="is-key">{report.name}</td>
                <td>{report.reportLabel}</td>
                <td className="is-muted">{report.developmentName ?? "Consolidado"}</td>
                <td>{PERIODICITY_LABELS[report.periodicity] ?? report.periodicity}</td>
                <td className="is-muted">{report.recipients.length > 0 ? report.recipients.join(", ") : "—"}</td>
                <td className="is-muted">{report.lastGeneratedAt ? formatDateTimeBR(report.lastGeneratedAt) : "Nunca"}</td>
                <td>{report.isActive ? "Ativo" : "Inativo"}</td>
                <td>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    <button type="button" className="secondary" onClick={() => handleGenerateNow(report)}>
                      Gerar agora
                    </button>
                    {canEdit ? (
                      <>
                        <button type="button" className="secondary" onClick={() => setEditing(report)}>Editar</button>
                        <button type="button" className="secondary" onClick={() => handleDelete(report)}>Excluir</button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing !== null && editing !== "new" ? (
        <ScheduledReportForm
          report={editing}
          reportOptions={reportOptions}
          developments={developments}
          onSaved={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      ) : editing === "new" ? (
        <ScheduledReportForm
          report={null}
          reportOptions={reportOptions}
          developments={developments}
          onSaved={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      ) : canEdit ? (
        <button type="button" onClick={() => setEditing("new")}>+ Novo agendamento</button>
      ) : null}
    </div>
  );
}
