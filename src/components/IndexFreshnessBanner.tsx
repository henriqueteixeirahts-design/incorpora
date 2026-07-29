import { getIndexFreshnessWarnings } from "@/server/audit";

/**
 * Regra de bloqueio prudente do V1 (docs/ESPEC_CONFIABILIDADE_JOBS_AUDITORIA.md,
 * Parte 2.4): se o índice do mês estiver ausente após o prazo de publicação,
 * toda tela que exibe valor corrigido avisa isso em vez de mostrar o número
 * desatualizado silenciosamente.
 */
export async function IndexFreshnessBanner({ organizationId }: { organizationId: string }) {
  const warnings = await getIndexFreshnessWarnings(organizationId);
  if (warnings.length === 0) return null;

  return (
    <div
      style={{
        marginTop: "1rem",
        padding: "0.75rem 1rem",
        border: "1px solid color-mix(in srgb, var(--danger-color, #b91c1c) 40%, transparent)",
        borderRadius: 8,
        backgroundColor: "color-mix(in srgb, var(--danger-color, #b91c1c) 8%, transparent)",
        fontSize: "0.85rem",
      }}
    >
      {warnings.map((warning) => (
        <p key={`${warning.code}-${warning.referenceMonth}`}>
          Valores com índice de {warning.referenceMonth} pendente ({warning.indexRuleName}) — os valores
          corrigidos abaixo podem estar desatualizados.
        </p>
      ))}
    </div>
  );
}
