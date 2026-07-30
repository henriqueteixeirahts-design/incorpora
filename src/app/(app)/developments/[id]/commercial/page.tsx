import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getDevelopment } from "@/server/developments";
import { listUnits } from "@/server/units";
import { listCustomers, listBrokers, listAgencies } from "@/server/crm";
import { listSalesTables } from "@/server/sales-tables";
import { listReservations, listWaitlistForOrganization } from "@/server/reservations";
import { getEffectiveReservationRule } from "@/server/reservation-rules";
import { listProposals } from "@/server/proposals";
import { runJobForSingleOrganization, expireReservationsJob } from "@/server/jobs";
import { NewReservationForm } from "./new-reservation-form";
import { NewProposalForm } from "./new-proposal-form";
import {
  cancelReservationAction,
  renewReservationAction,
  cancelWaitlistEntryAction,
  submitProposalAction,
  decideApprovalAction,
  convertToSaleAction,
} from "./actions";

const RESERVATION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  EXPIRED: "Expirada",
  CONVERTED: "Convertida",
  CANCELLED: "Cancelada",
};

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_APPROVAL: "Em aprovação",
  APPROVED: "Aprovada",
  REJECTED: "Reprovada",
  CONVERTED: "Convertida em venda",
  CANCELLED: "Cancelada",
};

const APPROVAL_LEVEL_LABELS: Record<string, string> = {
  COMMERCIAL: "Comercial",
  SALES_MANAGER: "Gerente comercial",
  DIRECTOR: "Diretor",
  FINANCIAL: "Financeiro",
  LEGAL: "Jurídico",
  PARTNERS: "Sócios",
};

export default async function CommercialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const development = await getDevelopment(context.organizationId, id);
  if (!development) notFound();

  await runJobForSingleOrganization(expireReservationsJob, context.organizationId, "EVENT");

  const [units, customers, brokers, agencies, salesTables, allReservations, allProposals, allWaitlist, rule] =
    await Promise.all([
      listUnits(id),
      listCustomers(context.organizationId),
      listBrokers(context.organizationId),
      listAgencies(context.organizationId),
      listSalesTables(id),
      listReservations(context.organizationId),
      listProposals(context.organizationId),
      listWaitlistForOrganization(context.organizationId),
      getEffectiveReservationRule(id),
    ]);

  const reservations = allReservations.filter((r) => r.unit.developmentId === id);
  const proposals = allProposals.filter((p) => p.developmentId === id);
  const waitlist = allWaitlist.filter((w) => w.unit.developmentId === id);

  const availableUnits = units.filter(
    (unit) => !unit.isAccessory && (unit.status === "AVAILABLE" || unit.status === "RESERVED"),
  );

  const canCreateReservation = hasPermission(context, "reservation", "CREATE");
  const canCancelReservation = hasPermission(context, "reservation", "CANCEL");
  const canRenewAsEditor = hasPermission(context, "reservation", "EDIT");
  const canRenewAsApprover = hasPermission(context, "reservation", "APPROVE");
  const canCreateProposal = hasPermission(context, "proposal", "CREATE");
  const canEditProposal = hasPermission(context, "proposal", "EDIT");
  const canApproveProposal = hasPermission(context, "proposal", "APPROVE");
  const canCreateSale = hasPermission(context, "sale", "CREATE");

  const canRenewReservation = rule.requiresApprovalForRenewal ? canRenewAsApprover : canRenewAsEditor;

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href={`/developments/${id}`}>← {development.name}</Link>
      </p>
      <h1>Comercial</h1>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Reservas</h2>
        <table style={{ marginTop: "0.5rem", maxWidth: 900 }}>
          <thead>
            <tr>
              <th>Unidade</th>
              <th>Cliente</th>
              <th>Status</th>
              <th>Expira em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((reservation) => {
              const canRenewThis =
                canRenewReservation &&
                reservation.status === "ACTIVE" &&
                rule.renewalAllowed &&
                reservation.renewalCount < rule.maxRenewals;
              return (
                <tr key={reservation.id}>
                  <td>{reservation.unit.number}</td>
                  <td>
                    {reservation.customer.name}
                    {reservation.fromWaitlist ? " (fila de espera)" : ""}
                  </td>
                  <td>{RESERVATION_STATUS_LABELS[reservation.status]}</td>
                  <td>{new Date(reservation.expiresAt).toLocaleString("pt-BR")}</td>
                  <td>
                    <div className="row-actions">
                      {canRenewThis ? (
                        <form action={renewReservationAction}>
                          <input type="hidden" name="developmentId" value={id} />
                          <input type="hidden" name="reservationId" value={reservation.id} />
                          <button type="submit" className="secondary">
                            Renovar
                          </button>
                        </form>
                      ) : null}
                      {canCancelReservation && reservation.status === "ACTIVE" ? (
                        <form action={cancelReservationAction}>
                          <input type="hidden" name="developmentId" value={id} />
                          <input type="hidden" name="reservationId" value={reservation.id} />
                          <button type="submit" className="secondary">
                            Cancelar
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {reservations.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ opacity: 0.7 }}>
                  Nenhuma reserva.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {waitlist.length > 0 ? (
          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ fontSize: "0.95rem" }}>Fila de espera</h3>
            <table style={{ marginTop: "0.5rem", maxWidth: 700 }}>
              <thead>
                <tr>
                  <th>Unidade</th>
                  <th>Cliente</th>
                  <th>Desde</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {waitlist.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.unit.number}</td>
                    <td>{entry.customer.name}</td>
                    <td>{new Date(entry.createdAt).toLocaleString("pt-BR")}</td>
                    <td>
                      {canCancelReservation ? (
                        <form action={cancelWaitlistEntryAction}>
                          <input type="hidden" name="developmentId" value={id} />
                          <input type="hidden" name="entryId" value={entry.id} />
                          <button type="submit" className="secondary">
                            Remover da fila
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {canCreateReservation ? (
          <div style={{ marginTop: "1rem" }}>
            <NewReservationForm
              developmentId={id}
              units={availableUnits.map((u) => ({ id: u.id, label: `${u.number} (${u.status})` }))}
              customers={customers.map((c) => ({ id: c.id, label: c.name }))}
              brokers={brokers.map((b) => ({ id: b.id, label: b.name }))}
              agencies={agencies.map((a) => ({ id: a.id, label: a.name }))}
              salesTables={salesTables.map((t) => ({ id: t.id, label: t.name }))}
              defaultValidityHours={rule.validityHours}
            />
          </div>
        ) : null}
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Propostas</h2>

        {proposals.map((proposal) => (
          <div
            key={proposal.id}
            style={{
              border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
              borderRadius: 8,
              padding: "0.75rem 1rem",
              marginTop: "0.75rem",
              maxWidth: 700,
            }}
          >
            <p>
              <strong>{proposal.unit.number}</strong> — {proposal.customer.name} —{" "}
              {PROPOSAL_STATUS_LABELS[proposal.status]}
            </p>
            <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
              Preço de tabela {formatCurrency(Number(proposal.listPrice))} · desconto{" "}
              {Number(proposal.discountPercent)}% · venda {formatCurrency(Number(proposal.salePrice))}
            </p>

            {proposal.approvals.length > 0 ? (
              <ul style={{ marginTop: "0.5rem", paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
                {proposal.approvals.map((approval) => (
                  <li key={approval.id}>
                    {APPROVAL_LEVEL_LABELS[approval.level]}: {approval.decision}
                    {canApproveProposal && approval.decision === "PENDING" ? (
                      <form action={decideApprovalAction} style={{ display: "inline-flex", gap: "0.4rem", marginLeft: "0.5rem" }}>
                        <input type="hidden" name="developmentId" value={id} />
                        <input type="hidden" name="proposalId" value={proposal.id} />
                        <input type="hidden" name="level" value={approval.level} />
                        <button type="submit" name="decision" value="APPROVED">
                          Aprovar
                        </button>
                        <button type="submit" name="decision" value="REJECTED" className="secondary">
                          Reprovar
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
              {canEditProposal && proposal.status === "DRAFT" ? (
                <form action={submitProposalAction}>
                  <input type="hidden" name="developmentId" value={id} />
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <button type="submit">Enviar para aprovação</button>
                </form>
              ) : null}

              {canCreateSale && proposal.status === "APPROVED" ? (
                <form action={convertToSaleAction}>
                  <input type="hidden" name="developmentId" value={id} />
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <button type="submit">Converter em venda</button>
                </form>
              ) : null}
            </div>
          </div>
        ))}
        {proposals.length === 0 ? <p style={{ opacity: 0.7, marginTop: "0.5rem" }}>Nenhuma proposta.</p> : null}

        {canCreateProposal ? (
          <div style={{ marginTop: "1.5rem" }}>
            <NewProposalForm
              developmentId={id}
              units={availableUnits.map((u) => ({ id: u.id, label: `${u.number} (${u.status})` }))}
              customers={customers.map((c) => ({ id: c.id, label: c.name }))}
              brokers={brokers.map((b) => ({ id: b.id, label: b.name }))}
              agencies={agencies.map((a) => ({ id: a.id, label: a.name }))}
              salesTables={salesTables.map((t) => ({ id: t.id, label: t.name }))}
            />
          </div>
        ) : null}
      </section>
    </>
  );
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
