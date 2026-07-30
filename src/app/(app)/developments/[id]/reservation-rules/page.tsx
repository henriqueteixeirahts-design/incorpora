import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getDevelopment } from "@/server/developments";
import { getEffectiveReservationRule } from "@/server/reservation-rules";
import { listRoles } from "@/server/users";
import { ReservationRuleForm } from "./reservation-rule-form";

export default async function ReservationRulesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const development = await getDevelopment(context.organizationId, id);
  if (!development) notFound();

  const [rule, roles] = await Promise.all([
    getEffectiveReservationRule(id),
    listRoles(context.organizationId),
  ]);

  const canEdit = hasPermission(context, "development", "EDIT");

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href={`/developments/${id}`}>← {development.name}</Link>
      </p>
      <h1>Regras de reserva</h1>
      <p style={{ opacity: 0.7, maxWidth: 680 }}>
        Parâmetros de reserva deste empreendimento (docs/ESPEC_MODULO_COMERCIAL.md, Parte 2). Sem
        configuração salva, valem os padrões sugeridos pela especificação.
      </p>

      <ReservationRuleForm developmentId={id} rule={rule} roles={roles.map((r) => r.name)} canEdit={canEdit} />
    </>
  );
}
