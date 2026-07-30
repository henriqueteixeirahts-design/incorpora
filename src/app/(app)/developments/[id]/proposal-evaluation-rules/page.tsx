import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getDevelopment } from "@/server/developments";
import { getEffectiveProposalEvaluationRule } from "@/server/proposal-evaluation-rules";
import { ProposalEvaluationRuleForm } from "./proposal-evaluation-rule-form";

export default async function ProposalEvaluationRulesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const development = await getDevelopment(context.organizationId, id);
  if (!development) notFound();

  const rule = await getEffectiveProposalEvaluationRule(id);
  const canEdit = hasPermission(context, "development", "EDIT");

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href={`/developments/${id}`}>← {development.name}</Link>
      </p>
      <h1>Avaliação automática de propostas</h1>
      <p style={{ opacity: 0.7, maxWidth: 680 }}>
        Parâmetros do motor de VPL deste empreendimento (docs/ESPEC_MODULO_COMERCIAL.md, Parte 5.2).
        Sem configuração salva, valem os padrões sugeridos pela especificação.
      </p>

      <ProposalEvaluationRuleForm developmentId={id} rule={rule} canEdit={canEdit} />
    </>
  );
}
