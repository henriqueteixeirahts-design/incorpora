import { requireAccessContext } from "@/server/auth-context";
import { getCashFlow } from "@/server/cash-flow";

export default async function CashFlowPage() {
  const context = await requireAccessContext();
  const months = await getCashFlow(context.organizationId);

  return (
    <>
      <h1>Fluxo de caixa</h1>
      <p style={{ opacity: 0.7, maxWidth: 600 }}>
        Consolida a carteira a receber (parcelas de venda) com as contas a pagar, por mês de
        vencimento (previsto) e por mês do lançamento efetivo (realizado).
      </p>

      <table style={{ marginTop: "1.5rem", maxWidth: 1000 }}>
        <thead>
          <tr>
            <th>Mês</th>
            <th>A receber (previsto)</th>
            <th>Recebido (realizado)</th>
            <th>A pagar (previsto)</th>
            <th>Pago (realizado)</th>
            <th>Saldo previsto</th>
            <th>Saldo realizado</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.month}>
              <td>{formatMonth(month.month)}</td>
              <td>{formatCurrency(month.receivablesForecast)}</td>
              <td>{formatCurrency(month.receivablesRealized)}</td>
              <td>{formatCurrency(month.payablesForecast)}</td>
              <td>{formatCurrency(month.payablesRealized)}</td>
              <td style={{ color: month.netForecast < 0 ? "#e03131" : undefined }}>
                {formatCurrency(month.netForecast)}
              </td>
              <td style={{ color: month.netRealized < 0 ? "#e03131" : undefined }}>
                {formatCurrency(month.netRealized)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function formatMonth(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
