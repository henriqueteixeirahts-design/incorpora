import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { getSale } from "@/server/sales";
import { getContractBySale } from "@/server/contracts";
import type { PaymentFlowResult } from "@/lib/payment-flow";
import { CreateContractForm, MarkAwaitingSignatureForm, ConfirmSignatureForm } from "./contract-forms";

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Minuta gerada",
  AWAITING_SIGNATURE: "Aguardando assinatura",
  SIGNED: "Assinado",
  CANCELLED: "Cancelado",
};

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireAccessContext();

  const sale = await getSale(context.organizationId, id);
  if (!sale) notFound();

  const contract = await getContractBySale(context.organizationId, id);
  const canCreateContract = hasPermission(context, "contract", "CREATE");
  const canEditContract = hasPermission(context, "contract", "EDIT");

  const paymentFlow = sale.proposal.paymentFlow as unknown as PaymentFlowResult | null;

  return (
    <>
      <p style={{ marginBottom: "0.25rem" }}>
        <Link href="/sales">← Vendas</Link>
      </p>
      <h1>
        {sale.development.name} — {sale.unit.number}
      </h1>
      <p style={{ opacity: 0.7 }}>
        {sale.customer.name} · {formatCurrency(Number(sale.salePrice))} em{" "}
        {new Date(sale.saleDate).toLocaleDateString("pt-BR")}
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Contrato</h2>

        {!contract ? (
          canCreateContract ? (
            <div style={{ marginTop: "0.75rem" }}>
              <CreateContractForm saleId={id} />
            </div>
          ) : (
            <p style={{ opacity: 0.7 }}>Nenhum contrato gerado ainda.</p>
          )
        ) : (
          <div
            style={{
              border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
              borderRadius: 8,
              padding: "1rem",
              marginTop: "0.75rem",
              maxWidth: 700,
            }}
          >
            <p>
              <strong>{contract.contractNumber}</strong> —{" "}
              {CONTRACT_STATUS_LABELS[contract.status]}
            </p>
            <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
              Gerado em {new Date(contract.issuedAt).toLocaleDateString("pt-BR")}
              {contract.signedAt
                ? ` · assinado em ${new Date(contract.signedAt).toLocaleDateString("pt-BR")}`
                : ""}
            </p>
            {contract.signedDocumentUrl ? (
              <p style={{ fontSize: "0.85rem" }}>
                Documento assinado:{" "}
                <a href={contract.signedDocumentUrl} target="_blank" rel="noreferrer">
                  {contract.signedDocumentUrl}
                </a>
              </p>
            ) : null}

            <details style={{ marginTop: "0.75rem" }}>
              <summary>Minuta</summary>
              <div style={{ fontSize: "0.85rem", marginTop: "0.5rem", lineHeight: 1.6 }}>
                <p>
                  <strong>Contrato de Compra e Venda</strong> nº {contract.contractNumber}
                </p>
                <p>
                  Incorporadora: {sale.organization.name} — SPE: {sale.development.spe.name} (
                  {sale.development.spe.document})
                </p>
                <p>Empreendimento: {sale.development.name}</p>
                <p>Unidade: {sale.unit.number}</p>
                <p>Comprador: {sale.customer.name} — {sale.customer.document}</p>
                <p>Valor da venda: {formatCurrency(Number(sale.salePrice))}</p>
                {sale.proposal.broker ? <p>Corretor: {sale.proposal.broker.name}</p> : null}
                {sale.proposal.agency ? <p>Imobiliária: {sale.proposal.agency.name}</p> : null}
                {paymentFlow ? (
                  <>
                    <p style={{ marginTop: "0.5rem" }}>Fluxo de pagamento:</p>
                    <ul>
                      {paymentFlow.items.map((item, index) => (
                        <li key={index}>
                          {item.label}: {formatCurrency(item.amount)} (mês {item.dueOffsetMonths})
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </details>

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              {canEditContract && contract.status === "DRAFT" ? (
                <MarkAwaitingSignatureForm saleId={id} contractId={contract.id} />
              ) : null}
            </div>

            {canEditContract && contract.status === "AWAITING_SIGNATURE" ? (
              <div style={{ marginTop: "0.75rem" }}>
                <ConfirmSignatureForm saleId={id} contractId={contract.id} />
              </div>
            ) : null}
          </div>
        )}
      </section>

      {contract?.portfolio ? (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>Carteira</h2>
          <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
            Total: {formatCurrency(Number(contract.portfolio.totalValue))}
          </p>
          <table style={{ marginTop: "0.5rem", maxWidth: 600 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Parcela</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {contract.portfolio.installments.map((installment) => (
                <tr key={installment.id}>
                  <td>{installment.sequence}</td>
                  <td>{installment.label}</td>
                  <td>{new Date(installment.dueDate).toLocaleDateString("pt-BR")}</td>
                  <td>{formatCurrency(Number(installment.originalValue))}</td>
                  <td>{installment.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
