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
import { canSubmitForApproval, isPendingApproval } from "@/lib/proposal-status";
import { runJobForSingleOrganization, expireReservationsJob } from "@/server/jobs";
import { ReservationModal } from "./reservation-modal";
import { ProposalModal } from "./proposal-modal";
import {
  cancelReservationAction,
  renewReservationAction,
  cancelWaitlistEntryAction,
  submitProposalAction,
  decideApprovalAction,
  convertToSaleAction,
} from "./actions";
import { formatCurrencyBRL, formatDateTimeBR, formatPercent } from "@/lib/format";
import { UNIT_STATUS_META } from "@/lib/unit-status";

const RESERVATION_STATUS_CHIP: Record<string, string> = {
  ACTIVE: "inc-chip--reserva",
  EXPIRED: "inc-chip--atraso",
  CONVERTED: "inc-chip--contrato",
  CANCELLED: "inc-chip--permuta",
};

const RESERVATION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  EXPIRED: "Expirada",
  CONVERTED: "Convertida",
  CANCELLED: "Cancelada",
};

const PROPOSAL_STATUS_CHIP: Record<string, string> = {
  DRAFT: "inc-chip--permuta",
  PENDING_APPROVAL: "inc-chip--reserva",
  APPROVED: "inc-chip--contrato",
  REJECTED: "inc-chip--atraso",
  CONVERTED: "inc-chip--contrato",
  CANCELLED: "inc-chip--permuta",
};

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PENDING_APPROVAL: "Em aprovação",
  APPROVED: "Aprovada",
  REJECTED: "Reprovada",
  CONVERTED: "Convertida em venda",
  CANCELLED: "Cancelada",
};

const EVALUATION_STATUS_LABELS: Record<string, string> = {
  APPROVED_AUTO: "Aprovada automaticamente",
  PENDING_ANALYSIS: "Aguardando análise do gestor",
  REJECTED_AUTO: "Reprovada automaticamente",
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ unitId?: string }>;
}) {
  const { id } = await params;
  const { unitId: defaultUnitId } = await searchParams;
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
      getEffectiveReservationRule(context.organizationId, id),
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

  // Módulo de aprovação (docs/ESPEC_MODULO_COMERCIAL.md, Parte 5.2: "fila das
  // propostas em Aguardando análise, visível só pra quem tem alçada") — lugar
  // dedicado e visualmente distinto, separado da lista geral de propostas
  // (docs/RELATORIO_TESTDRIVE.md, achado 17).
  const pendingApprovalProposals = canApproveProposal ? proposals.filter(isPendingApproval) : [];

  const unitOptions = availableUnits.map((u) => ({ id: u.id, label: `${u.number} (${UNIT_STATUS_META[u.status].label})` }));
  const customerOptions = customers.map((c) => ({ id: c.id, label: c.name }));
  const brokerOptions = brokers.map((b) => ({ id: b.id, label: b.name }));
  const agencyOptions = agencies.map((a) => ({ id: a.id, label: a.name }));
  const salesTableOptions = salesTables.map((t) => ({ id: t.id, label: t.name }));

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">
            <Link href={`/developments/${id}`}>← {development.name}</Link>
          </div>
          <h1 className="inc-h1">Comercial</h1>
        </div>
      </div>

      {pendingApprovalProposals.length > 0 ? (
        <div className="inc-card" style={{ borderTop: "3px solid var(--inc-brand-dourado)" }}>
          <div className="inc-card__head">
            <div className="inc-card__title">Aprovações pendentes</div>
            <div className="inc-card__meta">{pendingApprovalProposals.length} proposta(s) aguardando sua decisão</div>
          </div>
          <div className="inc-card__body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {pendingApprovalProposals.map((proposal) => (
              <div key={proposal.id} style={{ padding: "14px 16px", border: "1px solid var(--inc-border-card)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <strong style={{ color: "var(--inc-brand-azul)" }}>{proposal.unit.number}</strong>
                  <span style={{ fontSize: "13.5px" }}>{proposal.customer.name}</span>
                  <span className="inc-chip inc-chip--reserva" style={{ marginLeft: "auto" }}>
                    {EVALUATION_STATUS_LABELS[proposal.evaluationStatus ?? ""] ?? proposal.evaluationStatus}
                  </span>
                </div>
                <p style={{ marginTop: "8px", fontSize: "12.5px", color: "var(--inc-text-secondary)" }}>
                  VPL tabela {formatCurrencyBRL(Number(proposal.npvStandard))} vs. proposto{" "}
                  {formatCurrencyBRL(Number(proposal.npvProposed))} (
                  {Number(proposal.npvDeviationPercent) >= 0 ? "+" : ""}
                  {formatPercent(Number(proposal.npvDeviationPercent))}) — {proposal.evaluationReason}
                </p>
                {proposal.approvals
                  .filter((a) => a.decision === "PENDING")
                  .map((approval) => (
                    <form
                      key={approval.id}
                      action={decideApprovalAction}
                      style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginTop: "10px" }}
                    >
                      <input type="hidden" name="developmentId" value={id} />
                      <input type="hidden" name="proposalId" value={proposal.id} />
                      <input type="hidden" name="level" value={approval.level} />
                      <span style={{ fontSize: "12px", color: "var(--inc-text-soft)" }}>
                        Alçada: {APPROVAL_LEVEL_LABELS[approval.level]}
                      </span>
                      <button type="submit" name="decision" value="APPROVED" className="inc-btn inc-btn--primary inc-btn--sm">
                        Aprovar
                      </button>
                      <button type="submit" name="decision" value="REJECTED" className="inc-btn inc-btn--danger inc-btn--sm">
                        Reprovar
                      </button>
                    </form>
                  ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="inc-card">
        <div className="inc-card__head">
          <div className="inc-card__title">Reservas</div>
          {canCreateReservation ? (
            <div style={{ marginLeft: "auto" }}>
              <ReservationModal
                developmentId={id}
                units={unitOptions}
                customers={customerOptions}
                brokers={brokerOptions}
                agencies={agencyOptions}
                salesTables={salesTableOptions}
                defaultValidityHours={rule.validityHours}
              />
            </div>
          ) : null}
        </div>
        <table className="inc-table" style={{ border: 0 }}>
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
                  <td className="is-key">{reservation.unit.number}</td>
                  <td>
                    {reservation.customer.name}
                    {reservation.fromWaitlist ? <span className="inc-table__sub">Fila de espera</span> : null}
                  </td>
                  <td>
                    <span className={`inc-chip ${RESERVATION_STATUS_CHIP[reservation.status] ?? ""}`}>
                      {RESERVATION_STATUS_LABELS[reservation.status]}
                    </span>
                  </td>
                  <td className="is-muted">{formatDateTimeBR(reservation.expiresAt)}</td>
                  <td>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      {canRenewThis ? (
                        <form action={renewReservationAction}>
                          <input type="hidden" name="developmentId" value={id} />
                          <input type="hidden" name="reservationId" value={reservation.id} />
                          <button type="submit" className="inc-btn inc-btn--secondary inc-btn--sm">
                            Renovar
                          </button>
                        </form>
                      ) : null}
                      {canCancelReservation && reservation.status === "ACTIVE" ? (
                        <form action={cancelReservationAction}>
                          <input type="hidden" name="developmentId" value={id} />
                          <input type="hidden" name="reservationId" value={reservation.id} />
                          <button type="submit" className="inc-btn inc-btn--secondary inc-btn--sm">
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
                <td colSpan={5} className="is-empty">
                  Nenhuma reserva.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {waitlist.length > 0 ? (
          <>
            <div className="inc-card__head" style={{ borderTop: "1px solid var(--inc-border-divider)" }}>
              <div className="inc-card__title" style={{ fontSize: "13.5px" }}>Fila de espera</div>
            </div>
            <table className="inc-table" style={{ border: 0 }}>
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
                    <td className="is-key">{entry.unit.number}</td>
                    <td>{entry.customer.name}</td>
                    <td className="is-muted">{formatDateTimeBR(entry.createdAt)}</td>
                    <td>
                      {canCancelReservation ? (
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <form action={cancelWaitlistEntryAction}>
                            <input type="hidden" name="developmentId" value={id} />
                            <input type="hidden" name="entryId" value={entry.id} />
                            <button type="submit" className="inc-btn inc-btn--secondary inc-btn--sm">
                              Remover da fila
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </div>

      <div className="inc-card">
        <div className="inc-card__head">
          <div className="inc-card__title">Propostas</div>
          {canCreateProposal ? (
            <div style={{ marginLeft: "auto" }}>
              <ProposalModal
                developmentId={id}
                units={unitOptions}
                customers={customerOptions}
                brokers={brokerOptions}
                agencies={agencyOptions}
                salesTables={salesTableOptions}
                defaultUnitId={defaultUnitId}
              />
            </div>
          ) : null}
        </div>
        <div className="inc-card__body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {proposals.map((proposal) => (
            <div key={proposal.id} style={{ padding: "14px 16px", border: "1px solid var(--inc-border-card)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <strong style={{ color: "var(--inc-brand-azul)" }}>{proposal.unit.number}</strong>
                <span style={{ fontSize: "13.5px" }}>{proposal.customer.name}</span>
                <span className={`inc-chip ${PROPOSAL_STATUS_CHIP[proposal.status] ?? ""}`} style={{ marginLeft: "auto" }}>
                  {PROPOSAL_STATUS_LABELS[proposal.status]}
                </span>
              </div>
              <p style={{ marginTop: "6px", fontSize: "12.5px", color: "var(--inc-text-secondary)" }}>
                Preço de tabela {formatCurrencyBRL(Number(proposal.listPrice))} · desconto{" "}
                {formatPercent(Number(proposal.discountPercent))} · venda {formatCurrencyBRL(Number(proposal.salePrice))}
              </p>

              {proposal.evaluationStatus ? (
                <p style={{ marginTop: "4px", fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
                  {EVALUATION_STATUS_LABELS[proposal.evaluationStatus] ?? proposal.evaluationStatus} — VPL tabela{" "}
                  {formatCurrencyBRL(Number(proposal.npvStandard))} vs. proposto{" "}
                  {formatCurrencyBRL(Number(proposal.npvProposed))} ({Number(proposal.npvDeviationPercent) >= 0 ? "+" : ""}
                  {formatPercent(Number(proposal.npvDeviationPercent))})
                  <br />
                  {proposal.evaluationReason}
                </p>
              ) : null}

              {proposal.approvals.length > 0 ? (
                <ul style={{ marginTop: "8px", paddingLeft: "18px", fontSize: "12.5px" }}>
                  {proposal.approvals.map((approval) => (
                    <li key={approval.id}>
                      {APPROVAL_LEVEL_LABELS[approval.level]}: {approval.decision}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                {canEditProposal && canSubmitForApproval(proposal) ? (
                  <form action={submitProposalAction}>
                    <input type="hidden" name="developmentId" value={id} />
                    <input type="hidden" name="proposalId" value={proposal.id} />
                    <button type="submit" className="inc-btn inc-btn--secondary inc-btn--sm">
                      Enviar para aprovação
                    </button>
                  </form>
                ) : null}

                {canCreateSale && proposal.status === "APPROVED" ? (
                  <form action={convertToSaleAction}>
                    <input type="hidden" name="developmentId" value={id} />
                    <input type="hidden" name="proposalId" value={proposal.id} />
                    <button type="submit" className="inc-btn inc-btn--primary inc-btn--sm">
                      Converter em venda
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
          {proposals.length === 0 ? <p className="is-empty" style={{ fontSize: "13px" }}>Nenhuma proposta.</p> : null}
        </div>
      </div>
    </>
  );
}
