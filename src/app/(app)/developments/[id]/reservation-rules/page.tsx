import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getDevelopment } from "@/server/developments";
import { getEffectiveReservationRule, getReservationRule } from "@/server/reservation-rules";
import { listRoles } from "@/server/users";
import { ReservationRuleForm } from "./reservation-rule-form";

export default async function ReservationRulesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const development = await getDevelopment(context, id);
  if (!development) notFound();

  const [rule, ownRule, roles] = await Promise.all([
    getEffectiveReservationRule(context.organizationId, id),
    getReservationRule(context, id),
    listRoles(context.organizationId),
  ]);

  const canEdit = hasPermission(context, "development", "EDIT");

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">
            <Link href={`/developments/${id}`}>← {development.name}</Link>
          </div>
          <h1 className="inc-h1">Regras de reserva</h1>
        </div>
      </div>
      <p style={{ color: "var(--inc-text-soft)", fontSize: "13px", maxWidth: 680 }}>
        Parâmetros de reserva deste empreendimento (docs/ESPEC_MODULO_COMERCIAL.md, Parte 2).{" "}
        {ownRule ? (
          "Este empreendimento tem uma regra própria (sobrescreve a geral)."
        ) : (
          <>
            Usando a{" "}
            <Link href="/settings/rules/reservation" style={{ color: "var(--inc-brand-azul)" }}>
              regra geral da organização
            </Link>
            {" "}(ou os padrões sugeridos pela especificação, se a geral também não estiver configurada).
          </>
        )}
      </p>

      <ReservationRuleForm developmentId={id} rule={rule} roles={roles.map((r) => r.name)} canEdit={canEdit} />
    </>
  );
}
