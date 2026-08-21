import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getDevelopment } from "@/server/developments";
import { getEffectiveRenegotiationRule, getRenegotiationRule } from "@/server/renegotiation-rules";
import { RenegotiationRuleForm } from "./renegotiation-rule-form";

export default async function RenegotiationRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const development = await getDevelopment(context, id);
  if (!development) notFound();

  const [rule, ownRule] = await Promise.all([
    getEffectiveRenegotiationRule(context.organizationId, id),
    getRenegotiationRule(context, id),
  ]);
  const canEdit = hasPermission(context, "development", "EDIT");

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href={`/developments/${id}`}>← {development.name}</Link>
      </p>
      <h1>Renegociação de parcelas</h1>
      <p style={{ opacity: 0.7, maxWidth: 680 }}>
        Tolerância de desconto sobre encargos sem alçada, prazo máximo de reparcelamento e comportamento de acordo
        quebrado (docs/ESPEC_FASE_B_CARTEIRA_FINANCEIRO_1.md, Parte 2.2). Descontos acima da tolerância exigem
        aprovação nos níveis configurados.
        {" "}
        {ownRule ? (
          "Este empreendimento tem uma regra própria (sobrescreve a geral)."
        ) : (
          <>
            Usando a{" "}
            <Link href="/settings/rules/renegotiation">regra geral da organização</Link>
            {" "}(ou o default do sistema, se a geral também não estiver configurada).
          </>
        )}
      </p>

      <RenegotiationRuleForm developmentId={id} rule={rule} canEdit={canEdit} />
    </>
  );
}
