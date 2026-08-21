import Link from "next/link";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getGeneralCommissionRule, listCommissionRuleOverrides, DEFAULT_COMMISSION_RULE } from "@/server/commission-rules";
import { listDevelopments } from "@/server/developments";
import { CommissionRuleManager } from "./commission-rule-manager";

export default async function CommissionRulePage() {
  const context = await requireAccessContext();
  const canEdit = hasPermission(context, "development", "EDIT");

  const [generalRule, overrides, developments] = await Promise.all([
    getGeneralCommissionRule(context),
    listCommissionRuleOverrides(context),
    listDevelopments(context),
  ]);

  const rule = generalRule
    ? {
        externalCommissionPercent: generalRule.externalCommissionPercent === null ? null : Number(generalRule.externalCommissionPercent),
        internalCommissionPercent: generalRule.internalCommissionPercent === null ? null : Number(generalRule.internalCommissionPercent),
        internalCommissionAppliesTo: generalRule.internalCommissionAppliesTo,
      }
    : DEFAULT_COMMISSION_RULE;

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">
            <Link href="/settings">← Configurações</Link>
          </div>
          <h1 className="inc-h1">Comissão — percentuais gerais</h1>
        </div>
      </div>
      <p style={{ fontSize: "var(--inc-fs-sm)", color: "var(--inc-text-muted)", maxWidth: 680 }}>
        Percentuais das duas naturezas de comissão (docs/ESPEC_CORRETOR_COMISSIONAMENTO.md, Parte 3.1 e Parte 4).
        Vale pra todo empreendimento sem regra própria — configure uma exceção abaixo pra um empreendimento
        específico. Sem regra configurada, nenhuma comissão é calculada.
      </p>

      <CommissionRuleManager
        generalRule={rule}
        overrides={overrides.map((o) => ({
          id: o.id,
          developmentId: o.developmentId!,
          developmentName: o.development?.name ?? "",
          externalCommissionPercent: o.externalCommissionPercent === null ? null : Number(o.externalCommissionPercent),
          internalCommissionPercent: o.internalCommissionPercent === null ? null : Number(o.internalCommissionPercent),
          internalCommissionAppliesTo: o.internalCommissionAppliesTo,
        }))}
        developments={developments
          .filter((d) => !overrides.some((o) => o.developmentId === d.id))
          .map((d) => ({ id: d.id, name: d.name }))}
        canEdit={canEdit}
      />
    </>
  );
}
