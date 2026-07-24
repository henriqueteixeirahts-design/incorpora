import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listCustomers } from "@/server/crm";
import { NewCustomerForm } from "./new-customer-form";

const TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Pessoa física",
  COMPANY: "Pessoa jurídica",
};

export default async function CustomersPage() {
  const context = await requireAccessContext();
  const customers = await listCustomers(context.organizationId);
  const canCreate = hasPermission(context, "customer", "CREATE");

  return (
    <>
      <h1>Clientes</h1>
      <table style={{ marginTop: "1.5rem", maxWidth: 900 }}>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Tipo</th>
            <th>Documento</th>
            <th>Contato</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id}>
              <td>{customer.name}</td>
              <td>{TYPE_LABELS[customer.type]}</td>
              <td>{customer.document}</td>
              <td>{[customer.email, customer.phone].filter(Boolean).join(" · ") || "—"}</td>
            </tr>
          ))}
          {customers.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ opacity: 0.7 }}>
                Nenhum cliente cadastrado.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {canCreate ? <NewCustomerForm /> : null}
    </>
  );
}
