import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getDevelopment } from "@/server/developments";
import { listUnits } from "@/server/units";
import { listExchangeContracts } from "@/server/exchange-contracts";
import { listReservations, listWaitlistForOrganization } from "@/server/reservations";
import { getEffectiveReservationRule } from "@/server/reservation-rules";
import { listCustomers, listBrokers, listAgencies } from "@/server/crm";
import { listSalesTables } from "@/server/sales-tables";
import { runJobForSingleOrganization, expireReservationsJob } from "@/server/jobs";
import { EspelhoGrid } from "./espelho-grid";

export default async function DevelopmentMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const development = await getDevelopment(context.organizationId, id);
  if (!development) notFound();

  await runJobForSingleOrganization(expireReservationsJob, context.organizationId, "EVENT");

  const [units, contracts, allReservations, allWaitlist, customers, brokers, agencies, salesTables, rule] =
    await Promise.all([
      listUnits(id),
      listExchangeContracts(context, id),
      listReservations(context.organizationId),
      listWaitlistForOrganization(context.organizationId),
      listCustomers(context.organizationId),
      listBrokers(context.organizationId),
      listAgencies(context.organizationId),
      listSalesTables(id),
      getEffectiveReservationRule(id),
    ]);

  const principalUnits = units.filter((unit) => !unit.isAccessory);
  const buildingUnits = principalUnits.filter((unit) => unit.buildingId);
  const unassignedUnits = principalUnits.filter((unit) => !unit.buildingId);

  const reservations = allReservations
    .filter((r) => r.status === "ACTIVE" && r.unit.developmentId === id)
    .map((r) => ({
      id: r.id,
      unitId: r.unitId,
      customerName: r.customer.name,
      brokerName: r.broker?.name ?? null,
      expiresAt: r.expiresAt,
      renewalCount: r.renewalCount,
    }));

  const canCreateReservation = hasPermission(context, "reservation", "CREATE");
  const canCreateProposal = hasPermission(context, "proposal", "CREATE");
  const canManageExchange = hasPermission(context, "exchange_contract", "EDIT");
  const canCancelReservation = hasPermission(context, "reservation", "CANCEL");
  const canRenewReservation = hasPermission(
    context,
    "reservation",
    rule.requiresApprovalForRenewal ? "APPROVE" : "EDIT",
  );

  const waitlistCounts = new Map<string, number>();
  for (const entry of allWaitlist) {
    if (entry.unit.developmentId !== id) continue;
    waitlistCounts.set(entry.unitId, (waitlistCounts.get(entry.unitId) ?? 0) + 1);
  }

  const mapUnit = (unit: (typeof units)[number]) => ({
    id: unit.id,
    number: unit.number,
    status: unit.status,
    unitType: unit.unitType,
    buildingId: unit.buildingId,
    floorId: unit.floorId,
    position: unit.position,
    block: unit.block,
    referenceValue: unit.referenceValue === null ? null : Number(unit.referenceValue),
    exchangeContractId: unit.exchangeContractId,
  });

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href={`/developments/${id}`}>← {development.name}</Link>
      </p>
      <h1>Espelho de vendas</h1>

      <EspelhoGrid
        developmentId={id}
        buildings={development.buildings.map((b) => ({
          id: b.id,
          name: b.name,
          floors: b.floors.map((f) => ({ id: f.id, level: f.level, label: f.label })),
        }))}
        units={buildingUnits.map(mapUnit)}
        unassignedUnits={unassignedUnits.map(mapUnit)}
        contracts={contracts.map((c) => ({
          id: c.id,
          permutanteName: c.permutante.name,
          type: c.type,
          managedBySystem: c.managedBySystem,
        }))}
        reservations={reservations}
        customers={customers.map((c) => ({ id: c.id, label: c.name }))}
        brokers={brokers.map((b) => ({ id: b.id, label: b.name }))}
        agencies={agencies.map((a) => ({ id: a.id, label: a.name }))}
        salesTables={salesTables.map((t) => ({ id: t.id, label: t.name }))}
        canCreateReservation={canCreateReservation}
        canCreateProposal={canCreateProposal}
        canManageExchange={canManageExchange}
        canCancelReservation={canCancelReservation}
        canRenewReservation={canRenewReservation}
        renewalAllowed={rule.renewalAllowed}
        maxRenewals={rule.maxRenewals}
        defaultValidityHours={rule.validityHours}
        waitlistCounts={Object.fromEntries(waitlistCounts)}
      />
    </>
  );
}
