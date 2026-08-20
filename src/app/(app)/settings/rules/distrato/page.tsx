import Link from "next/link";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getGeneralDistratoRule, listDistratoRuleOverrides, DEFAULT_DISTRATO_RULE } from "@/server/distrato-rules";
import { DistratoRuleForm } from "@/app/(app)/developments/[id]/distrato-rule/distrato-rule-form";

export default async function GeneralDistratoRulePage() {
  const context = await requireAccessContext();
  const canEdit = hasPermission(context, "development", "EDIT");

  const [generalRule, overrides] = await Promise.all([
    getGeneralDistratoRule(context),
    listDistratoRuleOverrides(context),
  ]);

  const rule = generalRule
    ? { retentionPercent: Number(generalRule.retentionPercent), reverseCommissionOnDistrato: generalRule.reverseCommissionOnDistrato }
    : DEFAULT_DISTRATO_RULE;

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">
            <Link href="/settings">← Configurações</Link>
          </div>
          <h1 className="inc-h1">Regra de distrato — geral</h1>
        </div>
      </div>
      <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)", maxWidth: 680 }}>
        Vale pra todo empreendimento que não tem regra própria. Teto legal mais conservador (25%, sem
        patrimônio de afetação) — um empreendimento com patrimônio de afetação instituído pode ter teto
        maior, mas só configurando uma regra específica pra ele (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md,
        Parte 2.4 — Lei 13.786/18).
      </p>

      <DistratoRuleForm developmentId={null} rule={rule} cap={25} canEdit={canEdit} />

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
                <th className="is-num">Retenção</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => (
                <tr key={o.id}>
                  <td className="is-key">{o.development?.name}</td>
                  <td className="is-num">{Number(o.retentionPercent)}%</td>
                  <td>
                    {o.developmentId ? (
                      <Link href={`/developments/${o.developmentId}/distrato-rule`} style={{ color: "var(--inc-brand-azul)" }}>
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
