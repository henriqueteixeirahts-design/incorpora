import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listAgencies, listBrokers } from "@/server/crm";
import { NewAgencyForm, NewBrokerForm } from "./partner-forms";

export default async function PartnersPage() {
  const context = await requireAccessContext();
  const [agencies, brokers] = await Promise.all([
    listAgencies(context.organizationId),
    listBrokers(context.organizationId),
  ]);
  const canCreateAgency = hasPermission(context, "agency", "CREATE");
  const canCreateBroker = hasPermission(context, "broker", "CREATE");

  return (
    <>
      <h1>Imobiliárias e corretores</h1>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Imobiliárias</h2>
        <table style={{ marginTop: "0.5rem", maxWidth: 600 }}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>CNPJ</th>
            </tr>
          </thead>
          <tbody>
            {agencies.map((agency) => (
              <tr key={agency.id}>
                <td>{agency.name}</td>
                <td>{agency.document ?? "—"}</td>
              </tr>
            ))}
            {agencies.length === 0 ? (
              <tr>
                <td colSpan={2} style={{ opacity: 0.7 }}>
                  Nenhuma imobiliária cadastrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {canCreateAgency ? (
          <div style={{ marginTop: "1rem" }}>
            <NewAgencyForm />
          </div>
        ) : null}
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Corretores</h2>
        <table style={{ marginTop: "0.5rem", maxWidth: 700 }}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Imobiliária</th>
              <th>Contato</th>
            </tr>
          </thead>
          <tbody>
            {brokers.map((broker) => (
              <tr key={broker.id}>
                <td>{broker.name}</td>
                <td>{broker.agency?.name ?? "Autônomo"}</td>
                <td>{[broker.email, broker.phone].filter(Boolean).join(" · ") || "—"}</td>
              </tr>
            ))}
            {brokers.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ opacity: 0.7 }}>
                  Nenhum corretor cadastrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {canCreateBroker ? (
          <div style={{ marginTop: "1rem" }}>
            <NewBrokerForm agencies={agencies} />
          </div>
        ) : null}
      </section>
    </>
  );
}
