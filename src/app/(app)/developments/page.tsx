import Link from "next/link";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listDevelopments } from "@/server/developments";
import { listSpes } from "@/server/spes";
import { NewDevelopmentForm } from "./new-development-form";

const TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL_BUILDING: "Edifício residencial",
  COMMERCIAL_BUILDING: "Edifício comercial",
  MIXED_USE: "Empreendimento misto",
  HORIZONTAL_CONDOMINIUM: "Condomínio horizontal de lotes",
  SUBDIVISION: "Loteamento",
  OTHER: "Outro",
};

export default async function DevelopmentsPage() {
  const context = await requireAccessContext();
  const [developments, spes] = await Promise.all([
    listDevelopments(context.organizationId),
    listSpes(context.organizationId),
  ]);
  const canCreate = hasPermission(context, "development", "CREATE");

  return (
    <>
      <h1>Empreendimentos</h1>

      <table style={{ marginTop: "1.5rem", maxWidth: 900 }}>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Tipo</th>
            <th>SPE</th>
            <th>Cidade/UF</th>
            <th>Unidades</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {developments.map((development) => (
            <tr key={development.id}>
              <td>{development.name}</td>
              <td>{TYPE_LABELS[development.type] ?? development.type}</td>
              <td>{development.spe.name}</td>
              <td>
                {[development.city, development.state].filter(Boolean).join("/") || "—"}
              </td>
              <td>{development._count.units}</td>
              <td>
                <Link href={`/developments/${development.id}`}>Abrir</Link>
              </td>
            </tr>
          ))}
          {developments.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ opacity: 0.7 }}>
                Nenhum empreendimento cadastrado.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {canCreate ? (
        spes.length > 0 ? (
          <NewDevelopmentForm spes={spes} />
        ) : (
          <p style={{ marginTop: "2rem", opacity: 0.7 }}>
            Cadastre uma <Link href="/spes">SPE</Link> antes de criar um empreendimento.
          </p>
        )
      ) : null}
    </>
  );
}
