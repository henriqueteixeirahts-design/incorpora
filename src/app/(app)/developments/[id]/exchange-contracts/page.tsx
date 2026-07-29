import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getDevelopment } from "@/server/developments";
import { listExchangeContracts } from "@/server/exchange-contracts";
import { listAllPermutantes } from "@/server/permutantes";
import { listSpeLands } from "@/server/spe-lands";
import { ExchangeContractsManager } from "./exchange-contracts-manager";

export default async function ExchangeContractsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const development = await getDevelopment(context.organizationId, id);
  if (!development) notFound();

  const [contracts, permutantes, lands] = await Promise.all([
    listExchangeContracts(context, id),
    listAllPermutantes(context.organizationId),
    listSpeLands(context, development.speId),
  ]);

  const canCreate = hasPermission(context, "exchange_contract", "CREATE");
  const canEdit = hasPermission(context, "exchange_contract", "EDIT");
  const canDelete = hasPermission(context, "exchange_contract", "DELETE");

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href={`/developments/${id}`}>← {development.name}</Link>
      </p>
      <h1>Permuta</h1>
      <p style={{ opacity: 0.7, maxWidth: 680 }}>
        Contratos de permuta deste empreendimento. O destaque de unidades da permuta física acontece no{" "}
        <Link href={`/developments/${id}/map`}>espelho de vendas</Link>, em modo permutante.
      </p>

      {permutantes.length === 0 ? (
        <p className="field-hint" style={{ marginTop: "1rem" }}>
          Nenhum permutante cadastrado ainda — <Link href="/permutantes">cadastre um primeiro</Link>.
        </p>
      ) : null}

      <div style={{ marginTop: "1.5rem" }}>
        <ExchangeContractsManager
          developmentId={id}
          contracts={contracts.map((c) => ({
            id: c.id,
            permutanteId: c.permutanteId,
            permutanteName: c.permutante.name,
            type: c.type,
            appraisalValue: c.appraisalValue === null ? null : Number(c.appraisalValue),
            contractDate: c.contractDate,
            notes: c.notes,
            status: c.status,
            managedBySystem: c.managedBySystem,
            administrationFeePct: c.administrationFeePct === null ? null : Number(c.administrationFeePct),
            landIds: c.lands.map((l) => l.landId),
            landLabels: c.lands.map((l) => l.land.registrationNumber),
            unitCount: c.units.length,
            unitNumbers: c.units.map((u) => u.number),
            contractDocumentPath: c.contractDocumentPath,
          }))}
          permutantes={permutantes.map((p) => ({ id: p.id, label: p.name }))}
          lands={lands.map((l) => ({ id: l.id, label: l.registrationNumber }))}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </div>
    </>
  );
}
