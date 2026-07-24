import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getDevelopment } from "@/server/developments";
import { listUnits } from "@/server/units";
import { UNIT_STATUS_META } from "@/lib/unit-status";
import { NewBuildingForm, NewFloorForm } from "./building-floor-forms";
import { CreateUnitForm } from "./create-unit-form";
import { UnitStatusSelect } from "./unit-status-select";
import { LinkAccessoryForm } from "./link-accessory-form";

export default async function DevelopmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const development = await getDevelopment(context.organizationId, id);
  if (!development) notFound();

  const units = await listUnits(id);
  const canEdit = hasPermission(context, "development", "EDIT");
  const canCreateUnit = hasPermission(context, "unit", "CREATE");
  const canEditUnit = hasPermission(context, "unit", "EDIT");

  const principalUnits = units.filter((unit) => !unit.isAccessory);
  const accessoryUnits = units.filter((unit) => unit.isAccessory);

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href="/developments">← Empreendimentos</Link>
      </p>
      <h1>{development.name}</h1>
      <p style={{ opacity: 0.7 }}>
        {development.spe.name} · {[development.city, development.state].filter(Boolean).join("/")}
      </p>
      <p style={{ marginTop: "0.5rem", display: "flex", gap: "1rem" }}>
        <Link href={`/developments/${id}/map`}>Mapa de disponibilidade →</Link>
        <Link href={`/developments/${id}/sales-tables`}>Tabelas de venda →</Link>
        <Link href={`/developments/${id}/commercial`}>Comercial →</Link>
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Torres e pavimentos</h2>
        <ul>
          {development.buildings.map((building) => (
            <li key={building.id}>
              {building.name} — {building.floors.length} pavimento(s)
            </li>
          ))}
          {development.buildings.length === 0 ? (
            <li style={{ opacity: 0.7, listStyle: "none" }}>
              Nenhuma torre/bloco cadastrado (não se aplica a loteamentos).
            </li>
          ) : null}
        </ul>
        {canEdit ? (
          <>
            <NewBuildingForm developmentId={id} />
            {development.buildings.length > 0 ? (
              <NewFloorForm developmentId={id} buildings={development.buildings} />
            ) : null}
          </>
        ) : null}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Unidades ({units.length})</h2>
        <table style={{ marginTop: "0.75rem", maxWidth: 900 }}>
          <thead>
            <tr>
              <th>Número</th>
              <th>Tipo</th>
              <th>Acessória</th>
              <th>Status</th>
              <th>Vínculos</th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => (
              <tr key={unit.id}>
                <td>{unit.number}</td>
                <td>{unit.unitType}</td>
                <td>{unit.isAccessory ? "Sim" : "—"}</td>
                <td>
                  {canEditUnit ? (
                    <UnitStatusSelect developmentId={id} unitId={unit.id} status={unit.status} />
                  ) : (
                    <span style={{ color: UNIT_STATUS_META[unit.status].color }}>
                      {UNIT_STATUS_META[unit.status].label}
                    </span>
                  )}
                </td>
                <td>
                  {unit.linksAsPrincipal.length > 0
                    ? unit.linksAsPrincipal.map((link) => link.accessoryUnit.number).join(", ")
                    : "—"}
                </td>
              </tr>
            ))}
            {units.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ opacity: 0.7 }}>
                  Nenhuma unidade cadastrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {canCreateUnit ? (
          <CreateUnitForm developmentId={id} buildings={development.buildings} />
        ) : null}
      </section>

      {canEditUnit && principalUnits.length > 0 && accessoryUnits.length > 0 ? (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>Vincular unidade acessória</h2>
          <LinkAccessoryForm
            developmentId={id}
            principalUnits={principalUnits.map((unit) => ({ id: unit.id, number: unit.number }))}
            accessoryUnits={accessoryUnits.map((unit) => ({ id: unit.id, number: unit.number }))}
          />
        </section>
      ) : null}
    </>
  );
}
