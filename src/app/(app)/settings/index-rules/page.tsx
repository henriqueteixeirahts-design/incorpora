import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listIndexRules } from "@/server/index-rules";
import { NewIndexRuleForm, NewIndexValueForm, SyncIndexRuleButton } from "./index-rule-forms";
import { formatCalendarDateBR, formatPercent } from "@/lib/format";

const CODE_LABELS: Record<string, string> = {
  INCC: "INCC",
  IPCA: "IPCA",
  IGPM: "IGP-M",
  FIXED: "Taxa fixa",
};

const OFFICIAL_SOURCE_CODES = new Set(["INCC", "IPCA", "IGPM"]);

export default async function IndexRulesPage() {
  const context = await requireAccessContext();
  const rules = await listIndexRules(context.organizationId);
  const canManage = hasPermission(context, "index_rule", "CREATE");
  const canEdit = hasPermission(context, "index_rule", "EDIT");

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Configurações</div>
          <h1 className="inc-h1">Índices de correção</h1>
        </div>
      </div>
      <p className="inc-lede">
        Catálogo de índices usados para corrigir as carteiras. INCC, IPCA e IGP-M podem ser
        buscados automaticamente do Banco Central (semanalmente, e sob demanda aqui); lançamento
        manual continua disponível e nunca é sobrescrito por uma busca automática.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--inc-space-10)" }}>
        {rules.map((rule) => (
          <div key={rule.id} className="inc-card">
            <div className="inc-card__head">
              <div className="inc-card__title">
                {rule.name} <span className="is-muted" style={{ fontWeight: 400 }}>— {CODE_LABELS[rule.code]}</span>
              </div>
              {canEdit && OFFICIAL_SOURCE_CODES.has(rule.code) ? (
                <div className="inc-page-head__actions" style={{ marginLeft: "auto" }}>
                  <SyncIndexRuleButton indexRuleId={rule.id} />
                </div>
              ) : null}
            </div>
            {rule.values.length > 0 ? (
              <table className="inc-table" style={{ border: 0 }}>
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>%</th>
                    <th>Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {rule.values.map((value) => (
                    <tr key={value.id}>
                      <td>{formatCalendarDateBR(value.referenceMonth, { month: "2-digit", year: "numeric" })}</td>
                      <td>{formatPercent(Number(value.ratePercent), 4)}</td>
                      <td className="is-muted">
                        {value.source === "OFFICIAL" ? "Banco Central" : "Manual"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="inc-card__body">
                <p className="inc-help">Nenhum valor mensal lançado ainda.</p>
              </div>
            )}
          </div>
        ))}
        {rules.length === 0 ? <p className="inc-help">Nenhum índice cadastrado.</p> : null}
      </div>

      {canManage ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--inc-space-8)" }}>
          <NewIndexRuleForm />
          {rules.length > 0 ? (
            <NewIndexValueForm rules={rules.map((r) => ({ id: r.id, name: r.name }))} />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
