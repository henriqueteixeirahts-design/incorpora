import Link from "next/link";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  getGeneralProposalEvaluationRule,
  listProposalEvaluationRuleOverrides,
  DEFAULT_PROPOSAL_EVALUATION_RULE,
  DEFAULT_ANALYSIS_APPROVAL_LEVELS,
} from "@/server/proposal-evaluation-rules";
import { ProposalEvaluationRuleForm } from "@/app/(app)/developments/[id]/proposal-evaluation-rules/proposal-evaluation-rule-form";

export default async function GeneralProposalEvaluationRulePage() {
  const context = await requireAccessContext();
  const canEdit = hasPermission(context, "development", "EDIT");

  const [generalRule, overrides] = await Promise.all([
    getGeneralProposalEvaluationRule(context),
    listProposalEvaluationRuleOverrides(context),
  ]);

  const rule = generalRule
    ? {
        allowOffTable: generalRule.allowOffTable,
        discountRatePercent: Number(generalRule.discountRatePercent),
        discountRatePeriod: generalRule.discountRatePeriod,
        vplTolerancePercent: Number(generalRule.vplTolerancePercent),
        vplAnalysisLimitPercent: Number(generalRule.vplAnalysisLimitPercent),
        minDownPaymentPercent: Number(generalRule.minDownPaymentPercent),
        maxTermMonths: generalRule.maxTermMonths,
        maxPostKeysPercent: Number(generalRule.maxPostKeysPercent),
        analysisApprovalLevels: generalRule.analysisApprovalLevels,
      }
    : { ...DEFAULT_PROPOSAL_EVALUATION_RULE, analysisApprovalLevels: DEFAULT_ANALYSIS_APPROVAL_LEVELS };

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">
            <Link href="/settings">← Configurações</Link>
          </div>
          <h1 className="inc-h1">Parâmetros de avaliação de propostas — geral</h1>
        </div>
      </div>
      <p style={{ color: "var(--inc-text-soft)", fontSize: "13px", maxWidth: 680 }}>
        Vale pra todo empreendimento que não tem parâmetros próprios (docs/ESPEC_MODULO_COMERCIAL.md, Parte 5.2;
        docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 1.3). Um empreendimento com necessidades diferentes pode ter
        parâmetros específicos, configurados na própria tela dele.
      </p>

      <ProposalEvaluationRuleForm developmentId={null} rule={rule} canEdit={canEdit} />

      <div className="inc-eyebrow" style={{ marginTop: "24px", marginBottom: "8px" }}>
        Sobrescrições por empreendimento
      </div>
      {overrides.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--inc-text-soft)" }}>
          Nenhum empreendimento tem parâmetros próprios — todos usam os gerais acima.
        </p>
      ) : (
        <div className="inc-card">
          <table className="inc-table" style={{ border: 0 }}>
            <thead>
              <tr>
                <th>Empreendimento</th>
                <th className="is-num">Tolerância VPL</th>
                <th className="is-num">Entrada mínima</th>
                <th className="is-num">Prazo máximo</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => (
                <tr key={o.id}>
                  <td className="is-key">{o.development?.name}</td>
                  <td className="is-num">{Number(o.vplTolerancePercent)}%</td>
                  <td className="is-num">{Number(o.minDownPaymentPercent)}%</td>
                  <td className="is-num">{o.maxTermMonths} meses</td>
                  <td>
                    {o.developmentId ? (
                      <Link
                        href={`/developments/${o.developmentId}/proposal-evaluation-rules`}
                        style={{ color: "var(--inc-brand-azul)" }}
                      >
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
