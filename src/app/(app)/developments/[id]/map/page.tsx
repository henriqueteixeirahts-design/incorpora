import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext } from "@/server/auth-context";
import { getDevelopment } from "@/server/developments";
import { listUnits } from "@/server/units";
import { UNIT_STATUS_META } from "@/lib/unit-status";

export default async function DevelopmentMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const development = await getDevelopment(context.organizationId, id);
  if (!development) notFound();

  const units = await listUnits(id);
  const principalUnits = units.filter((unit) => !unit.isAccessory);

  const unitsByBuilding = new Map<string, typeof principalUnits>();
  const unassignedUnits: typeof principalUnits = [];

  for (const unit of principalUnits) {
    if (unit.buildingId) {
      const list = unitsByBuilding.get(unit.buildingId) ?? [];
      list.push(unit);
      unitsByBuilding.set(unit.buildingId, list);
    } else {
      unassignedUnits.push(unit);
    }
  }

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href={`/developments/${id}`}>← {development.name}</Link>
      </p>
      <h1>Mapa de disponibilidade</h1>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", margin: "1rem 0" }}>
        {Object.values(UNIT_STATUS_META).map((meta) => (
          <span key={meta.label} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem" }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: meta.color,
                display: "inline-block",
              }}
            />
            {meta.label}
          </span>
        ))}
      </div>

      {development.buildings.map((building) => {
        const buildingUnits = unitsByBuilding.get(building.id) ?? [];
        const floors = [...building.floors].sort((a, b) => b.level - a.level);

        return (
          <section key={building.id} style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.05rem" }}>{building.name}</h2>
            {floors.map((floor) => {
              const floorUnits = buildingUnits
                .filter((unit) => unit.floorId === floor.id)
                .sort((a, b) => a.number.localeCompare(b.number));

              if (floorUnits.length === 0) return null;

              return (
                <div key={floor.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
                  <span style={{ width: 90, fontSize: "0.8rem", opacity: 0.7 }}>
                    {floor.label ?? `Andar ${floor.level}`}
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                    {floorUnits.map((unit) => (
                      <span
                        key={unit.id}
                        title={UNIT_STATUS_META[unit.status].label}
                        style={{
                          background: UNIT_STATUS_META[unit.status].color,
                          color: "#fff",
                          borderRadius: 4,
                          padding: "0.25rem 0.5rem",
                          fontSize: "0.8rem",
                        }}
                      >
                        {unit.number}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}

      {unassignedUnits.length > 0 ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ fontSize: "1.05rem" }}>Lotes / unidades sem torre</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.5rem" }}>
            {unassignedUnits
              .sort((a, b) => a.number.localeCompare(b.number))
              .map((unit) => (
                <span
                  key={unit.id}
                  title={UNIT_STATUS_META[unit.status].label}
                  style={{
                    background: UNIT_STATUS_META[unit.status].color,
                    color: "#fff",
                    borderRadius: 4,
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.8rem",
                  }}
                >
                  {unit.number}
                </span>
              ))}
          </div>
        </section>
      ) : null}

      {principalUnits.length === 0 ? <p style={{ opacity: 0.7 }}>Nenhuma unidade cadastrada.</p> : null}
    </>
  );
}
