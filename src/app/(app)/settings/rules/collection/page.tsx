import Link from "next/link";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getGeneralCollectionRule, listCollectionRuleOverrides, DEFAULT_COLLECTION_STEPS } from "@/server/collection-rules";
import { CollectionRuleForm } from "@/app/(app)/developments/[id]/collection-rule/collection-rule-form";

export default async function GeneralCollectionRulePage() {
  const context = await requireAccessContext();
  const canEdit = hasPermission(context, "development", "EDIT");

  const [generalRule, overrides] = await Promise.all([
    getGeneralCollectionRule(context),
    listCollectionRuleOverrides(context),
  ]);

  const steps =
    generalRule && generalRule.steps.length > 0
      ? generalRule.steps.map((s) => ({ sequence: s.sequence, offsetDays: s.offsetDays, actionLabel: s.actionLabel }))
      : DEFAULT_COLLECTION_STEPS;

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">
            <Link href="/settings">← Configurações</Link>
          </div>
          <h1 className="inc-h1">Régua de cobrança — geral</h1>
        </div>
      </div>
      <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)", maxWidth: 680 }}>
        Vale pra todo empreendimento que não tem régua própria. Etapas da régua (prazo × ação sugerida) usadas pelo
        painel de Inadimplência pra mostrar em que etapa cada cliente está e a próxima ação sugerida
        (docs/ESPEC_FASE_B_CARTEIRA_FINANCEIRO_1.md, Parte 3.2). Assistida por ora — o sistema não dispara nada
        sozinho, só orienta.
      </p>

      <CollectionRuleForm developmentId={null} steps={steps} canEdit={canEdit} />

      <div className="inc-eyebrow" style={{ marginTop: "24px", marginBottom: "8px" }}>
        Sobrescrições por empreendimento
      </div>
      {overrides.length === 0 ? (
        <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)" }}>
          Nenhum empreendimento tem régua própria — todos usam a geral acima.
        </p>
      ) : (
        <div className="inc-card">
          <table className="inc-table" style={{ border: 0 }}>
            <thead>
              <tr>
                <th>Empreendimento</th>
                <th className="is-num">Etapas</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => (
                <tr key={o.id}>
                  <td className="is-key">{o.development?.name}</td>
                  <td className="is-num">{o.steps.length}</td>
                  <td>
                    {o.developmentId ? (
                      <Link href={`/developments/${o.developmentId}/collection-rule`} style={{ color: "var(--inc-brand-azul)" }}>
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
