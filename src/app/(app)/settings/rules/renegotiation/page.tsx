import Link from "next/link";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  getGeneralRenegotiationRule,
  listRenegotiationRuleOverrides,
  DEFAULT_RENEGOTIATION_RULE,
} from "@/server/renegotiation-rules";
import { RenegotiationRuleForm } from "@/app/(app)/developments/[id]/renegotiation-rule/renegotiation-rule-form";

export default async function GeneralRenegotiationRulePage() {
  const context = await requireAccessContext();
  const canEdit = hasPermission(context, "development", "EDIT");

  const [generalRule, overrides] = await Promise.all([
    getGeneralRenegotiationRule(context),
    listRenegotiationRuleOverrides(context),
  ]);

  const rule = generalRule
    ? {
        maxDiscountOnChargesPercent: Number(generalRule.maxDiscountOnChargesPercent),
        maxTermMonths: generalRule.maxTermMonths,
        brokenDealGraceDays: generalRule.brokenDealGraceDays,
        reactivateOriginalOnBreak: generalRule.reactivateOriginalOnBreak,
        approvalLevels: generalRule.approvalLevels,
      }
    : DEFAULT_RENEGOTIATION_RULE;

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">
            <Link href="/settings">← Configurações</Link>
          </div>
          <h1 className="inc-h1">Renegociação de parcelas — geral</h1>
        </div>
      </div>
      <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)", maxWidth: 680 }}>
        Vale pra todo empreendimento que não tem regra própria — tolerância de desconto sobre encargos sem
        alçada, prazo máximo de reparcelamento e comportamento de acordo quebrado
        (docs/ESPEC_FASE_B_CARTEIRA_FINANCEIRO_1.md, Parte 2.2).
      </p>

      <RenegotiationRuleForm developmentId={null} rule={rule} canEdit={canEdit} />

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
                <th className="is-num">Desconto máx.</th>
                <th className="is-num">Prazo máx.</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => (
                <tr key={o.id}>
                  <td className="is-key">{o.development?.name}</td>
                  <td className="is-num">{Number(o.maxDiscountOnChargesPercent)}%</td>
                  <td className="is-num">{o.maxTermMonths}m</td>
                  <td>
                    {o.developmentId ? (
                      <Link href={`/developments/${o.developmentId}/renegotiation-rule`} style={{ color: "var(--inc-brand-azul)" }}>
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
