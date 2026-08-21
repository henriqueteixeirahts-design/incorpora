"use client";

import { useState, useTransition } from "react";
import { formatCurrencyBRL } from "@/lib/format";
import { settleInternalCommissionAction } from "./actions";

export type UnsettledRow = { brokerId: string; brokerName: string; unsettled: number };

export function InternalCommissionSettlement({ rows, canSettle }: { rows: UnsettledRow[]; canSettle: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function handleSettle(brokerId: string, brokerName: string, amount: number) {
    if (!confirm(`Gerar conta a pagar consolidada de ${formatCurrencyBRL(amount)} pra ${brokerName}?`)) return;
    setError(null);
    setPendingId(brokerId);
    startTransition(async () => {
      const result = await settleInternalCommissionAction(brokerId);
      if (result.error) setError(result.error);
      setPendingId(null);
    });
  }

  if (rows.length === 0) {
    return (
      <p style={{ fontSize: "13px", color: "var(--inc-text-soft)" }}>
        Nenhuma comissão interna acumulada aguardando liquidação.
      </p>
    );
  }

  return (
    <div className="inc-card">
      {error ? <p className="error-text" style={{ margin: "0 0 10px" }}>{error}</p> : null}
      <table className="inc-table" style={{ border: 0 }}>
        <thead>
          <tr>
            <th>Gerente comercial interno</th>
            <th className="is-num">Acumulado a liquidar</th>
            {canSettle ? <th aria-label="Ações" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.brokerId}>
              <td className="is-key">{row.brokerName}</td>
              <td className="is-num">{formatCurrencyBRL(row.unsettled)}</td>
              {canSettle ? (
                <td>
                  <button
                    type="button"
                    className="inc-btn inc-btn--primary"
                    style={{ padding: "4px 10px", fontSize: "12px" }}
                    disabled={isPending && pendingId === row.brokerId}
                    onClick={() => handleSettle(row.brokerId, row.brokerName, row.unsettled)}
                  >
                    {isPending && pendingId === row.brokerId ? "Gerando..." : "Gerar pagamento"}
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
