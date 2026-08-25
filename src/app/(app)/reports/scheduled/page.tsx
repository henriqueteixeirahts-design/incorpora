import Link from "next/link";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listScheduledReports } from "@/server/scheduled-reports";
import { listDevelopments } from "@/server/developments";
import { REPORT_GROUPS } from "@/server/reports-center";
import { ScheduledReportsManager } from "./scheduled-reports-manager";

const REPORT_LABELS = Object.fromEntries(REPORT_GROUPS.flatMap((g) => g.reports.map((r) => [r.key, r.label])));

export default async function ScheduledReportsPage() {
  const context = await requireAccessContext();
  const canEdit = hasPermission(context, "development", "EDIT");

  const [reports, developments] = await Promise.all([listScheduledReports(context), listDevelopments(context)]);
  const developmentNameById = new Map(developments.map((d) => [d.id, d.name]));

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href="/reports">← Central de relatórios</Link>
      </p>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Relatórios</div>
          <h1 className="inc-h1">Relatórios agendados</h1>
          <p className="inc-lede">
            Estrutura de agendamento (relatório + filtros + periodicidade + destinatários) — geração manual por
            ora; o disparo automático por e-mail chega com a integração de comunicação da Fase 2.
          </p>
        </div>
      </div>

      <ScheduledReportsManager
        reports={reports.map((r) => ({
          id: r.id,
          name: r.name,
          reportKey: r.reportKey,
          reportLabel: REPORT_LABELS[r.reportKey] ?? r.reportKey,
          developmentId: r.developmentId,
          developmentName: r.developmentId ? (developmentNameById.get(r.developmentId) ?? null) : null,
          periodicity: r.periodicity,
          recipients: r.recipients,
          isActive: r.isActive,
          lastGeneratedAt: r.lastGeneratedAt,
        }))}
        reportOptions={REPORT_GROUPS.flatMap((g) => g.reports.map((r) => ({ key: r.key, label: `${g.group} — ${r.label}` })))}
        developments={developments.map((d) => ({ id: d.id, label: d.name }))}
        canEdit={canEdit}
      />
    </>
  );
}
