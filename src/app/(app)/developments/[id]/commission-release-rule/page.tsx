import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getDevelopment } from "@/server/developments";
import { getEffectiveCommissionReleaseRule } from "@/server/commission-release-rules";
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

  const rule = await getEffectiveCommissionReleaseRule(id);
  const canEdit = hasPermission(context, "development", "EDIT");

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href={`/developments/${id}`}>← {development.name}</Link>
      </p>
      <h1>Liberação de comissão</h1>
      <p style={{ opacity: 0.7, maxWidth: 680 }}>
        Quando a comissão de uma venda deste empreendimento passa de &quot;A liberar&quot; pra &quot;Liberada&quot;
        (docs/ESPEC_FASE_A_CONTRATOS_VENDAS.md, Parte 4.1). Sem configuração salva, libera na assinatura do
        contrato.
      </p>

      <CommissionReleaseRuleForm developmentId={id} rule={rule} canEdit={canEdit} />
    </>
  );
}
