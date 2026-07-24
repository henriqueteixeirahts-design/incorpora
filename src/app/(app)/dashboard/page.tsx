import { prisma } from "@/lib/prisma";
import { requireAccessContext } from "@/server/auth-context";

export default async function DashboardPage() {
  const context = await requireAccessContext();

  const [speCount, developmentCount, unitCount, userCount] = await Promise.all([
    prisma.specialPurposeEntity.count({ where: { organizationId: context.organizationId } }),
    prisma.development.count({ where: { organizationId: context.organizationId } }),
    prisma.unit.count({
      where: { development: { organizationId: context.organizationId } },
    }),
    prisma.accessGrant.count({ where: { organizationId: context.organizationId } }),
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
