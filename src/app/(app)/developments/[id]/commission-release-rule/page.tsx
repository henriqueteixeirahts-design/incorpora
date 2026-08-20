import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getDevelopment } from "@/server/developments";
import { getEffectiveCommissionReleaseRule, getCommissionReleaseRule } from "@/server/commission-release-rules";
import { CommissionReleaseRuleForm } from "./commission-release-rule-form";

export default async function CommissionReleaseRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const development = await getDevelopment(context.organizationId, id);
  if (!development) notFound();

  const [rule, ownRule] = await Promise.all([
    getEffectiveCommissionReleaseRule(context.organizationId, id),
    getCommissionReleaseRule(context, id),
  ]);
  const canEdit = hasPermission(context, "development", "EDIT");

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href={`/developments/${id}`}>← {development.name}</Link>
      </p>
      <h1>Liberação de comissão</h1>
      <p style={{ opacity: 0.7, maxWidth: 680 }}>
        Quando a comissão de uma venda deste empreendimento passa de &quot;A liberar&quot; pra &quot;Liberada&quot;
        (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md, Parte 4.1).
        {" "}
        {ownRule ? (
          "Este empreendimento tem uma regra própria (sobrescreve a geral)."
        ) : (
          <>
            Usando a{" "}
            <Link href="/settings/rules/commission-release">regra geral da organização</Link>
            {" "}(ou o default do sistema, se a geral também não estiver configurada).
          </>
        )}
      </p>

      <CommissionReleaseRuleForm developmentId={id} rule={rule} canEdit={canEdit} />
    </>
  );
}
