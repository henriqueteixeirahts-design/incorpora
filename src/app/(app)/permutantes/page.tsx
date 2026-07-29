import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listPermutantesPaged, type PermutanteSortField } from "@/server/permutantes";
import { PermutantesManager } from "./permutantes-manager";

const TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Pessoa física",
  COMPANY: "Pessoa jurídica",
};

const PAGE_SIZE = 20;

export default async function PermutantesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const search = params.q ?? "";
  const sortBy = (params.sort as PermutanteSortField) ?? "name";
  const sortDir = params.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(params.page) || 1);

  const { items, total } = await listPermutantesPaged(context.organizationId, {
    search,
    sortBy,
    sortDir,
    page,
    pageSize: PAGE_SIZE,
  });

  const canCreate = hasPermission(context, "permutante", "CREATE");
  const canEdit = hasPermission(context, "permutante", "EDIT");
  const canDelete = hasPermission(context, "permutante", "DELETE");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <h1>Permutantes</h1>
      <p style={{ opacity: 0.7, maxWidth: 620, marginTop: "0.5rem" }}>
        Terrenistas que trocam o terreno por unidades (permuta física) ou percentual sobre vendas (permuta
        financeira). O contrato de permuta em si fica na aba do empreendimento correspondente.
      </p>

      <div style={{ marginTop: "1.5rem" }}>
        <PermutantesManager
          permutantes={items.map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            typeLabel: TYPE_LABELS[p.type] ?? p.type,
            document: p.document,
            email: p.email,
            phone: p.phone,
          }))}
          total={total}
          page={page}
          totalPages={totalPages}
          search={search}
          sortBy={sortBy}
          sortDir={sortDir}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </div>
    </>
  );
}
