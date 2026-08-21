import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getDevelopment } from "@/server/developments";
import { getEffectiveDistratoRule, getDistratoRule } from "@/server/distrato-rules";
import { maxRetentionPercent } from "@/lib/distrato-settlement";
import { DistratoRuleForm } from "./distrato-rule-form";

export default async function DistratoRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const development = await getDevelopment(context, id);
  if (!development) notFound();

  const [rule, ownRule] = await Promise.all([
    getEffectiveDistratoRule(context.organizationId, id),
    getDistratoRule(context, id),
  ]);
  const canEdit = hasPermission(context, "development", "EDIT");
  const cap = maxRetentionPercent(development.hasPropertyAffectation);

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">
            <Link href={`/developments/${id}`}>← {development.name}</Link>
          </div>
          <h1 className="inc-h1">Regra de distrato</h1>
        </div>
      </div>
      <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)", maxWidth: 680 }}>
        % de retenção da incorporadora no acerto do distrato (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md, Parte
        2.4 — Lei 13.786/18). Teto legal deste empreendimento: {cap}%
        {development.hasPropertyAffectation ? " (patrimônio de afetação instituído)" : " (sem patrimônio de afetação)"}.
        {" "}
        {ownRule ? (
          "Este empreendimento tem uma regra própria (sobrescreve a geral)."
        ) : (
          <>
            Usando a{" "}
            <Link href="/settings/rules/distrato" style={{ color: "var(--inc-brand-azul)" }}>
              regra geral da organização
            </Link>
            {" "}(ou o default do sistema, se a geral também não estiver configurada).
          </>
        )}
      </p>

      <DistratoRuleForm developmentId={id} rule={rule} cap={cap} canEdit={canEdit} />
    </>
  );
}
