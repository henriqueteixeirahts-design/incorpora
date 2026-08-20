import Link from "next/link";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  getGeneralCommissionReleaseRule,
  listCommissionReleaseRuleOverrides,
  DEFAULT_COMMISSION_RELEASE_RULE,
} from "@/server/commission-release-rules";
import { CommissionReleaseRuleForm } from "@/app/(app)/developments/[id]/commission-release-rule/commission-release-rule-form";

const TRIGGER_LABELS: Record<string, string> = {
  ON_CONTRACT_SIGNATURE: "Na assinatura do contrato",
  ON_DOWN_PAYMENT_RECEIVED: "No recebimento da entrada",
  ON_INSTALLMENTS_PAID_PERCENT: "Quando X% das parcelas estiverem pagas",
};

export default async function GeneralCommissionReleaseRulePage() {
  const context = await requireAccessContext();
  const canEdit = hasPermission(context, "development", "EDIT");

  const [generalRule, overrides] = await Promise.all([
    getGeneralCommissionReleaseRule(context),
    listCommissionReleaseRuleOverrides(context),
  ]);

  const rule = generalRule
    ? { trigger: generalRule.trigger, installmentsPaidPercent: generalRule.installmentsPaidPercent }
    : DEFAULT_COMMISSION_RELEASE_RULE;

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href="/settings">← Configurações</Link>
      </p>
      <h1>Liberação de comissão — geral</h1>
      <p style={{ opacity: 0.7, maxWidth: 680 }}>
        Vale pra todo empreendimento que não tem regra própria. Quando a comissão de uma venda passa de
        &quot;A liberar&quot; pra &quot;Liberada&quot; (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md, Parte 4.1).
      </p>

      <CommissionReleaseRuleForm developmentId={null} rule={rule} canEdit={canEdit} />

      <div style={{ marginTop: "1.5rem", marginBottom: "0.5rem", fontWeight: 600 }}>Sobrescrições por empreendimento</div>
      {overrides.length === 0 ? (
        <p style={{ opacity: 0.7 }}>Nenhum empreendimento tem regra própria — todos usam a geral acima.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Empreendimento</th>
              <th>Gatilho</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {overrides.map((o) => (
              <tr key={o.id}>
                <td>{o.development?.name}</td>
                <td>
                  {TRIGGER_LABELS[o.trigger]}
                  {o.trigger === "ON_INSTALLMENTS_PAID_PERCENT" ? ` (${o.installmentsPaidPercent}%)` : ""}
                </td>
                <td>
                  {o.developmentId ? (
                    <Link href={`/developments/${o.developmentId}/commission-release-rule`}>Editar</Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
