import Link from "next/link";
import { requireAccessContext } from "@/server/auth-context";
import { listOverdueInstallments } from "@/server/receivables";

export default async function OverdueInstallmentsPage() {
  const context = await requireAccessContext();
  const installments = await listOverdueInstallments(context.organizationId);

  return (
    <>
      <h1>Inadimplência</h1>
      <p style={{ opacity: 0.7 }}>
        Parcelas vencidas e não quitadas, já com multa e juros de mora aplicados no recálculo.
      </p>

      <table style={{ marginTop: "1.5rem", maxWidth: 1000 }}>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Empreendimento / Unidade</th>
            <th>Parcela</th>
            <th>Vencimento</th>
            <th>Dias em atraso</th>
            <th>Valor corrigido</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {installments.map((installment) => (
            <tr key={installment.id}>
              <td>{installment.portfolio.contract.customer.name}</td>
              <td>
                {installment.portfolio.contract.development.name} —{" "}
                {installment.portfolio.contract.unit.number}
              </td>
              <td>{installment.label}</td>
              <td>{new Date(installment.dueDate).toLocaleDateString("pt-BR")}</td>
              <td>{daysSince(installment.dueDate)}</td>
              <td>{formatCurrency(Number(installment.correctedValue ?? installment.originalValue))}</td>
              <td>
                <Link href={`/sales/${installment.portfolio.contract.saleId}`}>Ver carteira →</Link>
              </td>
            </tr>
          ))}
          {installments.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ opacity: 0.7 }}>
                Nenhuma parcela em atraso.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </>
  );
}

function daysSince(date: Date) {
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000)));
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
