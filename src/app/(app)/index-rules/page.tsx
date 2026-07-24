import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listIndexRules } from "@/server/index-rules";
import { NewIndexRuleForm, NewIndexValueForm } from "./index-rule-forms";

const CODE_LABELS: Record<string, string> = {
  INCC: "INCC",
  IPCA: "IPCA",
  IGPM: "IGP-M",
  FIXED: "Taxa fixa",
};

export default async function IndexRulesPage() {
  const context = await requireAccessContext();
  const rules = await listIndexRules(context.organizationId);
  const canManage = hasPermission(context, "index_rule", "CREATE");

  return (
    <>
      <h1>Índices</h1>
      <p style={{ opacity: 0.7, maxWidth: 600 }}>
        Catálogo de índices usados para corrigir as carteiras. Os valores mensais precisam ser
        lançados manualmente — ainda não há integração automática com Banco Central/IBGE.
      </p>

      {rules.map((rule) => (
        <div
          key={rule.id}
          style={{
            border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
            borderRadius: 8,
            padding: "0.75rem 1rem",
            marginTop: "1rem",
            maxWidth: 600,
          }}
        >
          <p>
            <strong>{rule.name}</strong> — {CODE_LABELS[rule.code]}
          </p>
          {rule.values.length > 0 ? (
            <table style={{ marginTop: "0.5rem" }}>
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {rule.values.map((value) => (
                  <tr key={value.id}>
                    <td>{new Date(value.referenceMonth).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}</td>
                    <td>{Number(value.ratePercent)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ fontSize: "0.85rem", opacity: 0.7, marginTop: "0.4rem" }}>
              Nenhum valor mensal lançado ainda.
            </p>
          )}
        </div>
      ))}
      {rules.length === 0 ? <p style={{ opacity: 0.7, marginTop: "1rem" }}>Nenhum índice cadastrado.</p> : null}

      {canManage ? (
        <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <NewIndexRuleForm />
          {rules.length > 0 ? (
            <NewIndexValueForm rules={rules.map((r) => ({ id: r.id, name: r.name }))} />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
