import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listPayables } from "@/server/payables";
import { listSuppliers, listCostCenters } from "@/server/finance-setup";
import { listDevelopments } from "@/server/developments";
import { listSpes } from "@/server/spes";
import { NewPayableForm } from "./new-payable-form";
import { advancePayableStatusAction, cancelPayableAction } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  ENTERED: "Lançada",
  REVIEWED: "Conferida",
  APPROVED: "Aprovada",
  SCHEDULED: "Programada",
  PAID: "Paga",
  RECONCILED: "Conciliada",
  CANCELLED: "Cancelada",
};

const NEXT_ACTION_LABELS: Record<string, string> = {
  ENTERED: "Conferir",
  REVIEWED: "Aprovar",
  APPROVED: "Programar",
  SCHEDULED: "Marcar como paga",
  PAID: "Conciliar",
};

export default async function PayablesPage() {
  const context = await requireAccessContext();
  const [payables, suppliers, costCenters, developments, spes] = await Promise.all([
    listPayables(context.organizationId),
    listSuppliers(context.organizationId),
    listCostCenters(context.organizationId),
    listDevelopments(context.organizationId),
    listSpes(context.organizationId),
  ]);
  const canCreate = hasPermission(context, "payable", "CREATE");
  const canApprove = hasPermission(context, "payable", "APPROVE");
  const canCancel = hasPermission(context, "payable", "CANCEL");

  return (
    <>
      <h1>Contas a pagar</h1>

      <table style={{ marginTop: "1.5rem", maxWidth: 1100 }}>
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Empreendimento</th>
            <th>Vencimento</th>
            <th>Valor</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {payables.map((payable) => (
            <tr key={payable.id}>
              <td>{payable.description}</td>
              <td>{payable.category}</td>
              <td>{payable.development?.name ?? "Organização"}</td>
              <td>{new Date(payable.dueDate).toLocaleDateString("pt-BR")}</td>
              <td>{formatCurrency(Number(payable.amount))}</td>
              <td>{STATUS_LABELS[payable.status]}</td>
              <td style={{ display: "flex", gap: "0.4rem" }}>
                {canApprove && NEXT_ACTION_LABELS[payable.status] ? (
                  <form action={advancePayableStatusAction}>
                    <input type="hidden" name="payableId" value={payable.id} />
                    <button type="submit">{NEXT_ACTION_LABELS[payable.status]}</button>
                  </form>
                ) : null}
                {canCancel && payable.status !== "PAID" && payable.status !== "RECONCILED" && payable.status !== "CANCELLED" ? (
                  <form action={cancelPayableAction}>
                    <input type="hidden" name="payableId" value={payable.id} />
                    <button type="submit" className="secondary">
                      Cancelar
                    </button>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
          {payables.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ opacity: 0.7 }}>
                Nenhuma conta a pagar lançada.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {canCreate ? (
        <div style={{ marginTop: "2rem" }}>
          <NewPayableForm
            developments={developments.map((d) => ({ id: d.id, label: d.name }))}
            spes={spes.map((s) => ({ id: s.id, label: s.name }))}
            suppliers={suppliers.map((s) => ({ id: s.id, label: s.name }))}
            costCenters={costCenters.map((c) => ({ id: c.id, label: c.name }))}
          />
        </div>
      ) : null}
    </>
  );
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
