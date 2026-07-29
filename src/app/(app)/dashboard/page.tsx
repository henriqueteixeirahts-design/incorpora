import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getLatestAuditRun } from "@/server/audit";

export default async function DashboardPage() {
  const context = await requireAccessContext();

  const canViewAudit = hasPermission(context, "audit", "VIEW");

  const [speCount, developmentCount, unitCount, userCount, latestAuditRun] = await Promise.all([
    prisma.specialPurposeEntity.count({ where: { organizationId: context.organizationId } }),
    prisma.development.count({ where: { organizationId: context.organizationId } }),
    prisma.unit.count({
      where: { development: { organizationId: context.organizationId } },
    }),
    prisma.accessGrant.count({ where: { organizationId: context.organizationId } }),
    canViewAudit ? getLatestAuditRun(context.organizationId) : Promise.resolve(null),
  ]);

  const cards = [
    { label: "SPEs", value: speCount },
    { label: "Empreendimentos", value: developmentCount },
    { label: "Unidades", value: unitCount },
    { label: "Usuários com acesso", value: userCount },
  ];

  return (
    <>
      <h1>Dashboard</h1>

      {canViewAudit ? (
        <Link
          href="/settings/audit"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: "1rem",
            padding: "0.5rem 0.9rem",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            fontSize: "0.85rem",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: !latestAuditRun
                ? "color-mix(in srgb, var(--foreground) 30%, transparent)"
                : latestAuditRun.status === "OK"
                  ? "var(--success-color, #15803d)"
                  : "var(--danger-color, #b91c1c)",
            }}
          />
          {!latestAuditRun
            ? "Auditoria ainda não rodou"
            : latestAuditRun.status === "OK"
              ? "Carteira íntegra"
              : "Auditoria encontrou problema"}
        </Link>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "1rem",
          marginTop: "1.5rem",
          maxWidth: 720,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            style={{
              border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            <p style={{ fontSize: "0.8rem", opacity: 0.7 }}>{card.label}</p>
            <p style={{ fontSize: "1.75rem", fontWeight: 600 }}>{card.value}</p>
          </div>
        ))}
      </div>
    </>
  );
}
