import Link from "next/link";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listDevelopmentsPaged, type DevelopmentSortField } from "@/server/developments";
import { listSpes } from "@/server/spes";
import { DevelopmentsManager } from "./developments-manager";

const PAGE_SIZE = 20;

export default async function DevelopmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const search = params.q ?? "";
  const sortBy = (params.sort as DevelopmentSortField) ?? "name";
  const sortDir = params.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(params.page) || 1);

  const [{ items, total }, spes] = await Promise.all([
    listDevelopmentsPaged(context, {
      search,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    }),
    listSpes(context.organizationId),
  ]);

  const canCreate = hasPermission(context, "development", "CREATE");
  const canEdit = hasPermission(context, "development", "EDIT");
  const canDelete = hasPermission(context, "development", "DELETE");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Cadastros</div>
          <h1 className="inc-h1">Empreendimentos</h1>
        </div>
      </div>

      {canCreate && spes.length === 0 ? (
        <p style={{ marginTop: "1rem", opacity: 0.7 }}>
          Cadastre uma <Link href="/spes">SPE</Link> antes de criar um empreendimento.
        </p>
      ) : null}

      <DevelopmentsManager
        developments={items.map((d) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          city: d.city,
          state: d.state,
          address: d.address,
          speId: d.speId,
          speName: d.spe.name,
          unitsCount: d._count.units,
        }))}
        spes={spes.map((s) => ({ id: s.id, name: s.name }))}
        total={total}
        page={page}
        totalPages={totalPages}
        search={search}
        sortBy={sortBy}
        sortDir={sortDir}
        canCreate={canCreate && spes.length > 0}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  );
}
