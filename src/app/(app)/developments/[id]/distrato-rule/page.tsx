import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getDevelopment } from "@/server/developments";
import { getEffectiveDistratoRule } from "@/server/distrato-rules";
import { maxRetentionPercent } from "@/lib/distrato-settlement";
import { DistratoRuleForm } from "./distrato-rule-form";

export default async function DistratoRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const development = await getDevelopment(context.organizationId, id);
  if (!development) notFound();

  const rule = await getEffectiveDistratoRule(id);
  const canEdit = hasPermission(context, "development", "EDIT");
  const cap = maxRetentionPercent(development.hasPropertyAffectation);

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href={`/developments/${id}`}>← {development.name}</Link>
      </p>
      <h1>Regra de distrato</h1>
      <p style={{ opacity: 0.7, maxWidth: 680 }}>
        % de retenção da incorporadora no acerto do distrato (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md, Parte
        2.4 — Lei 13.786/18). Teto legal deste empreendimento: {cap}%
        {development.hasPropertyAffectation ? " (patrimônio de afetação instituído)" : " (sem patrimônio de afetação)"}.
      </p>

      <DistratoRuleForm developmentId={id} rule={rule} cap={cap} canEdit={canEdit} />
    </>
  );
}
