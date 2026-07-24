import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listSuppliers, listCostCenters } from "@/server/finance-setup";
import { listDevelopments } from "@/server/developments";
import { NewSupplierForm, NewCostCenterForm } from "./finance-setup-forms";

export default async function FinanceSetupPage() {
  const context = await requireAccessContext();
  const [suppliers, costCenters, developments] = await Promise.all([
    listSuppliers(context.organizationId),
    listCostCenters(context.organizationId),
    listDevelopments(context.organizationId),
  ]);
  const canCreateSupplier = hasPermission(context, "supplier", "CREATE");
  const canCreateCostCenter = hasPermission(context, "cost_center", "CREATE");

  return (
    <>
      <h1>Fornecedores e centros de custo</h1>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Fornecedores</h2>
        <table style={{ marginTop: "0.5rem", maxWidth: 700 }}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Documento</th>
              <th>Contato</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier) => (
              <tr key={supplier.id}>
                <td>{supplier.name}</td>
                <td>{supplier.document ?? "—"}</td>
                <td>{[supplier.email, supplier.phone].filter(Boolean).join(" · ") || "—"}</td>
              </tr>
            ))}
            {suppliers.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ opacity: 0.7 }}>
                  Nenhum fornecedor cadastrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {canCreateSupplier ? (
          <div style={{ marginTop: "1rem" }}>
            <NewSupplierForm />
          </div>
        ) : null}
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Centros de custo</h2>
        <table style={{ marginTop: "0.5rem", maxWidth: 700 }}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Empreendimento</th>
            </tr>
          </thead>
          <tbody>
            {costCenters.map((costCenter) => (
              <tr key={costCenter.id}>
                <td>{costCenter.name}</td>
                <td>{costCenter.development?.name ?? "Organização"}</td>
              </tr>
            ))}
            {costCenters.length === 0 ? (
              <tr>
                <td colSpan={2} style={{ opacity: 0.7 }}>
                  Nenhum centro de custo cadastrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {canCreateCostCenter ? (
          <div style={{ marginTop: "1rem" }}>
            <NewCostCenterForm developments={developments.map((d) => ({ id: d.id, name: d.name }))} />
          </div>
        ) : null}
      </section>
    </>
  );
}
