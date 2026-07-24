import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listSpes } from "@/server/spes";
import { NewSpeForm } from "./new-spe-form";

export default async function SpesPage() {
  const context = await requireAccessContext();
  const spes = await listSpes(context.organizationId);
  const canCreate = hasPermission(context, "spe", "CREATE");

  return (
    <>
      <h1>SPEs</h1>

      <table style={{ marginTop: "1.5rem", maxWidth: 720 }}>
        <thead>
          <tr>
            <th>Nome</th>
            <th>CNPJ</th>
            <th>Endereço</th>
          </tr>
        </thead>
        <tbody>
          {spes.map((spe) => (
            <tr key={spe.id}>
              <td>{spe.name}</td>
              <td>{spe.document}</td>
              <td>{spe.address ?? "—"}</td>
            </tr>
          ))}
          {spes.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ opacity: 0.7 }}>
                Nenhuma SPE cadastrada.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {canCreate ? <NewSpeForm /> : null}
    </>
  );
}
