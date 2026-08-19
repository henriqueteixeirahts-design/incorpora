import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listAgenciesPaged, listBrokersPaged, listAgencies, type AgencySortField, type BrokerSortField } from "@/server/crm";
import { AgenciesManager } from "./agencies-manager";
import { BrokersManager } from "./brokers-manager";

const PAGE_SIZE = 20;

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const agSearch = params.aq ?? "";
  const agSortBy = (params.asort as AgencySortField) ?? "name";
  const agSortDir = params.adir === "desc" ? "desc" : "asc";
  const agPage = Math.max(1, Number(params.apage) || 1);

  const brSearch = params.bq ?? "";
  const brSortBy = (params.bsort as BrokerSortField) ?? "name";
  const brSortDir = params.bdir === "desc" ? "desc" : "asc";
  const brPage = Math.max(1, Number(params.bpage) || 1);

  const [agenciesResult, brokersResult, allAgencies] = await Promise.all([
    listAgenciesPaged(context.organizationId, {
      search: agSearch,
      sortBy: agSortBy,
      sortDir: agSortDir,
      page: agPage,
      pageSize: PAGE_SIZE,
    }),
    listBrokersPaged(context.organizationId, {
      search: brSearch,
      sortBy: brSortBy,
      sortDir: brSortDir,
      page: brPage,
      pageSize: PAGE_SIZE,
    }),
    listAgencies(context.organizationId),
  ]);

  const canCreateAgency = hasPermission(context, "agency", "CREATE");
  const canEditAgency = hasPermission(context, "agency", "EDIT");
  const canDeleteAgency = hasPermission(context, "agency", "DELETE");
  const canCreateBroker = hasPermission(context, "broker", "CREATE");
  const canEditBroker = hasPermission(context, "broker", "EDIT");
  const canDeleteBroker = hasPermission(context, "broker", "DELETE");

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Cadastros</div>
          <h1 className="inc-h1">Imobiliárias e corretores</h1>
        </div>
      </div>

      <section style={{ marginTop: "28px" }}>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Imobiliárias</div>
        <AgenciesManager
          agencies={agenciesResult.items}
          total={agenciesResult.total}
          page={agPage}
          totalPages={Math.max(1, Math.ceil(agenciesResult.total / PAGE_SIZE))}
          search={agSearch}
          sortBy={agSortBy}
          sortDir={agSortDir}
          canCreate={canCreateAgency}
          canEdit={canEditAgency}
          canDelete={canDeleteAgency}
        />
      </section>

      <section style={{ marginTop: "40px" }}>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Corretores</div>
        <BrokersManager
          brokers={brokersResult.items.map((b) => ({
            id: b.id,
            name: b.name,
            document: b.document,
            email: b.email,
            phone: b.phone,
            agencyId: b.agencyId,
            agencyName: b.agency?.name ?? null,
            audit: b.audit,
          }))}
          agencies={allAgencies.map((a) => ({ id: a.id, name: a.name }))}
          total={brokersResult.total}
          page={brPage}
          totalPages={Math.max(1, Math.ceil(brokersResult.total / PAGE_SIZE))}
          search={brSearch}
          sortBy={brSortBy}
          sortDir={brSortDir}
          canCreate={canCreateBroker}
          canEdit={canEditBroker}
          canDelete={canDeleteBroker}
        />
      </section>
    </>
  );
}
