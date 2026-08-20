import Link from "next/link";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  getGeneralReservationRule,
  listReservationRuleOverrides,
  DEFAULT_RESERVATION_RULE,
} from "@/server/reservation-rules";
import { listRoles } from "@/server/users";
import { ReservationRuleForm } from "@/app/(app)/developments/[id]/reservation-rules/reservation-rule-form";

export default async function GeneralReservationRulePage() {
  const context = await requireAccessContext();
  const canEdit = hasPermission(context, "development", "EDIT");

  const [generalRule, overrides, roles] = await Promise.all([
    getGeneralReservationRule(context),
    listReservationRuleOverrides(context),
    listRoles(context.organizationId),
  ]);

  const rule = generalRule
    ? {
        validityHours: generalRule.validityHours,
        maxActiveReservationsPerBroker: generalRule.maxActiveReservationsPerBroker,
        waitlistEnabled: generalRule.waitlistEnabled,
        waitlistPriorityHours: generalRule.waitlistPriorityHours,
        renewalAllowed: generalRule.renewalAllowed,
        maxRenewals: generalRule.maxRenewals,
        requiresApprovalForRenewal: generalRule.requiresApprovalForRenewal,
        requireIdentifiedCustomer: generalRule.requireIdentifiedCustomer,
        allowedReserverRoles: generalRule.allowedReserverRoles,
      }
    : DEFAULT_RESERVATION_RULE;

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">
            <Link href="/settings">← Configurações</Link>
          </div>
          <h1 className="inc-h1">Regras de reserva — geral</h1>
        </div>
      </div>
      <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)", maxWidth: 680 }}>
        Vale pra todo empreendimento que não tem regra própria (docs/ESPEC_MODULO_COMERCIAL.md, Parte 2).
      </p>

      <ReservationRuleForm developmentId={null} rule={rule} roles={roles.map((r) => r.name)} canEdit={canEdit} />

      <div className="inc-eyebrow" style={{ marginTop: "24px", marginBottom: "8px" }}>
        Sobrescrições por empreendimento
      </div>
      {overrides.length === 0 ? (
        <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)" }}>
          Nenhum empreendimento tem regra própria — todos usam a geral acima.
        </p>
      ) : (
        <div className="inc-card">
          <table className="inc-table" style={{ border: 0 }}>
            <thead>
              <tr>
                <th>Empreendimento</th>
                <th className="is-num">Validade</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => (
                <tr key={o.id}>
                  <td className="is-key">{o.development?.name}</td>
                  <td className="is-num">{o.validityHours}h</td>
                  <td>
                    {o.developmentId ? (
                      <Link href={`/developments/${o.developmentId}/reservation-rules`} style={{ color: "var(--inc-brand-azul)" }}>
                        Editar
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
