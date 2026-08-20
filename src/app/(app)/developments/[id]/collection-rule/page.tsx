import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getDevelopment } from "@/server/developments";
import { getEffectiveCollectionSteps, getCollectionRule } from "@/server/collection-rules";
import { CollectionRuleForm } from "./collection-rule-form";

export default async function CollectionRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const development = await getDevelopment(context.organizationId, id);
  if (!development) notFound();

  const [steps, ownRule] = await Promise.all([
    getEffectiveCollectionSteps(context.organizationId, id),
    getCollectionRule(context, id),
  ]);
  const canEdit = hasPermission(context, "development", "EDIT");

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href={`/developments/${id}`}>← {development.name}</Link>
      </p>
      <h1>Régua de cobrança</h1>
      <p style={{ opacity: 0.7, maxWidth: 680 }}>
        Etapas da régua (prazo × ação sugerida) usadas pelo painel de Inadimplência pra mostrar em que etapa cada
        cliente está e a próxima ação sugerida (docs/ESPEC_FASE_B_CARTEIRA_FINANCEIRO_1.md, Parte 3.2). Assistida por
        ora — o sistema não dispara nada sozinho, só orienta.
        {" "}
        {ownRule ? (
          "Este empreendimento tem uma régua própria (sobrescreve a geral)."
        ) : (
          <>
            Usando a{" "}
            <Link href="/settings/rules/collection">regra geral da organização</Link>
            {" "}(ou o default do sistema, se a geral também não estiver configurada).
          </>
        )}
      </p>

      <CollectionRuleForm developmentId={id} steps={steps} canEdit={canEdit} />
    </>
  );
}
