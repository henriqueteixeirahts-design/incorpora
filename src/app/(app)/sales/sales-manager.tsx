"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { SortIcon } from "@/components/icons";
import { addCommissionSplitAction, getSaleCommissionSplitsAction, type FormState } from "./actions";
import type { SaleSortField } from "@/server/sales";
import { formatCurrencyBRL, formatDateBR } from "@/lib/format";

const COMMISSION_BENEFICIARY_LABELS: Record<string, string> = {
  BROKER: "Corretor",
  AGENCY: "Imobiliária",
  COORDINATOR: "Coordenador",
  MANAGER: "Gerente",
  CAMPAIGN: "Campanha",
};

const COMMISSION_STATUS_LABELS: Record<string, string> = {
  PENDING: "A liberar",
  RELEASED: "Liberada",
  INVOICED: "Faturada",
  PAID: "Paga",
  CANCELLED: "Cancelada",
};

export type CommissionSplitRow = {
  id: string;
  beneficiaryType: string;
  label: string | null;
  percent: number;
  value: number;
  status: string;
};

export type SaleRow = {
  id: string;
  saleNumber: string;
  developmentName: string;
  unitNumber: string;
  customerName: string;
  salePrice: number;
  saleDate: string;
  contractStatus: string | null;
  walletStatus: "EM_DIA" | "INADIMPLENTE" | null;
  brokerName: string | null;
  agencyName: string | null;
  commissionSplits: CommissionSplitRow[];
};

export type Option = { id: string; label: string };

const SORTABLE_COLUMNS: { field: SaleSortField; label: string }[] = [
  { field: "saleDate", label: "Data" },
  { field: "development", label: "Empreendimento" },
  { field: "customer", label: "Cliente" },
  { field: "salePrice", label: "Valor" },
];

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Minuta gerada",
  AWAITING_SIGNATURE: "Aguardando assinatura",
  SIGNED: "Assinado",
  CANCELLED: "Cancelado",
};

const CONTRACT_STATUS_CHIP: Record<string, string> = {
  DRAFT: "proposta",
  AWAITING_SIGNATURE: "reserva",
  SIGNED: "contrato",
  CANCELLED: "atraso",
};

const WALLET_STATUS_LABELS: Record<string, string> = {
  EM_DIA: "Em dia",
  INADIMPLENTE: "Inadimplente",
};

const formatCurrency = formatCurrencyBRL;

export function SalesManager({
  sales,
  brokers,
  agencies,
  total,
  page,
  totalPages,
  search,
  sortBy,
  sortDir,
  contractStatus,
  brokerId,
  agencyId,
  dateFrom,
  dateTo,
  walletStatus,
  canEditCommission,
}: {
  sales: SaleRow[];
  brokers: Option[];
  agencies: Option[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  sortBy: SaleSortField;
  sortDir: "asc" | "desc";
  contractStatus: string;
  brokerId: string;
  agencyId: string;
  dateFrom: string;
  dateTo: string;
  walletStatus: string;
  canEditCommission: boolean;
}) {
  const [commissionSale, setCommissionSale] = useState<SaleRow | null>(null);

  const filterParams = {
    q: search,
    contractStatus,
    brokerId,
    agencyId,
    dateFrom,
    dateTo,
    walletStatus,
  };

  function baseQuery() {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(filterParams)) {
      if (value) qs.set(key, value);
    }
    return qs;
  }

  function sortLink(field: SaleSortField) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    const qs = baseQuery();
    qs.set("sort", field);
    qs.set("dir", nextDir);
    return `/sales?${qs.toString()}`;
  }

  function pageLink(targetPage: number) {
    const qs = baseQuery();
    qs.set("sort", sortBy);
    qs.set("dir", sortDir);
    qs.set("page", String(targetPage));
    return `/sales?${qs.toString()}`;
  }

  const exportQs = baseQuery();
  const exportHref = `/api/sales/export?${exportQs.toString()}`;

  return (
    <>
      <form
        action="/sales"
        method="get"
        style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}
      >
        <input type="hidden" name="sort" value={sortBy} />
        <input type="hidden" name="dir" value={sortDir} />
        <div className="inc-search" style={{ width: 300 }}>
          <input
            type="search"
            name="q"
            placeholder="Buscar por nº, empreendimento, unidade ou cliente"
            defaultValue={search}
          />
        </div>
        <select name="contractStatus" className="inc-select" defaultValue={contractStatus}>
          <option value="">Status do contrato — todos</option>
          <option value="NONE">Sem contrato</option>
          {Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="walletStatus" className="inc-select" defaultValue={walletStatus}>
          <option value="">Carteira — todas</option>
          <option value="EM_DIA">Em dia</option>
          <option value="INADIMPLENTE">Inadimplente</option>
        </select>
        <select name="brokerId" className="inc-select" defaultValue={brokerId}>
          <option value="">Corretor — todos</option>
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <select name="agencyId" className="inc-select" defaultValue={agencyId}>
          <option value="">Imobiliária — todas</option>
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--inc-text-soft)" }}>
          De
          <input type="date" name="dateFrom" className="inc-input" defaultValue={dateFrom} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--inc-text-soft)" }}>
          Até
          <input type="date" name="dateTo" className="inc-input" defaultValue={dateTo} />
        </label>
        <button type="submit" className="inc-btn inc-btn--secondary">
          Filtrar
        </button>
        <a href={exportHref} className="inc-btn inc-btn--secondary" style={{ marginLeft: "auto" }}>
          Exportar (CSV)
        </a>
      </form>

      <p style={{ fontSize: "12.5px", color: "var(--inc-text-soft)", marginBottom: "10px" }}>
        {total} venda{total === 1 ? "" : "s"}
      </p>

      <div className="inc-card">
        <table className="inc-table" style={{ border: 0 }}>
          <thead>
            <tr>
              <th>Nº</th>
              {SORTABLE_COLUMNS.map((col) => (
                <th key={col.field}>
                  <Link
                    href={sortLink(col.field)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "inherit", textDecoration: "none" }}
                  >
                    {col.label}
                    <SortIcon direction={sortBy === col.field ? sortDir : null} />
                  </Link>
                </th>
              ))}
              <th>Unidade</th>
              <th>Status do contrato</th>
              <th>Carteira</th>
              <th>Corretor/imobiliária</th>
              <th>Comissões</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td colSpan={10} className="is-empty">
                  {search ? "Nenhuma venda encontrada." : "Nenhuma venda registrada."}
                </td>
              </tr>
            ) : null}
            {sales.map((sale) => (
              <tr key={sale.id}>
                <td className="is-key">{sale.saleNumber}</td>
                <td>{formatDateBR(sale.saleDate)}</td>
                <td>{sale.developmentName}</td>
                <td>{sale.customerName}</td>
                <td className="is-num">{formatCurrency(sale.salePrice)}</td>
                <td className="is-muted">{sale.unitNumber}</td>
                <td>
                  {sale.contractStatus ? (
                    <span className={`inc-chip inc-chip--${CONTRACT_STATUS_CHIP[sale.contractStatus] ?? "permuta"}`}>
                      {CONTRACT_STATUS_LABELS[sale.contractStatus] ?? sale.contractStatus}
                    </span>
                  ) : (
                    <span className="is-empty">Sem contrato</span>
                  )}
                </td>
                <td>
                  {sale.walletStatus ? (
                    <span className={`inc-chip inc-chip--${sale.walletStatus === "INADIMPLENTE" ? "atraso" : "contrato"}`}>
                      {WALLET_STATUS_LABELS[sale.walletStatus]}
                    </span>
                  ) : (
                    <span className="is-empty">—</span>
                  )}
                </td>
                <td className="is-muted">{sale.brokerName ?? sale.agencyName ?? "—"}</td>
                <td className="is-muted">{sale.commissionSplits.length > 0 ? `${sale.commissionSplits.length} lançada(s)` : "—"}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "flex-end" }}>
                    <Link href={`/sales/${sale.id}`} style={{ color: "var(--inc-brand-azul)", fontWeight: 500 }}>
                      Ver venda
                    </Link>
                    {canEditCommission ? (
                      <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={() => setCommissionSale(sale)}>
                        Comissão
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inc-table-foot">
          Página {page} de {totalPages}
          <div className="inc-pagination">
            {page > 1 ? (
              <Link href={pageLink(page - 1)}>← Anterior</Link>
            ) : (
              <span style={{ color: "var(--inc-text-placeholder)" }}>← Anterior</span>
            )}
            {page < totalPages ? (
              <Link href={pageLink(page + 1)}>Próxima →</Link>
            ) : (
              <span style={{ color: "var(--inc-text-placeholder)" }}>Próxima →</span>
            )}
          </div>
        </div>
      </div>

      {commissionSale ? (
        <CommissionModal
          sale={commissionSale}
          brokers={brokers}
          agencies={agencies}
          onClose={() => setCommissionSale(null)}
        />
      ) : null}
    </>
  );
}

const initialState: FormState = {};

function CommissionModal({
  sale,
  brokers,
  agencies,
  onClose,
}: {
  sale: SaleRow;
  brokers: Option[];
  agencies: Option[];
  onClose: () => void;
}) {
  const [splits, setSplits] = useState(sale.commissionSplits);
  const [state, dispatch, pending] = useActionState(addCommissionSplitAction, initialState);

  useEffect(() => {
    if (!state.success) return;
    getSaleCommissionSplitsAction(sale.id).then((fresh) => {
      if (!fresh) return;
      setSplits(
        fresh.map((s) => ({
          id: s.id,
          beneficiaryType: s.beneficiaryType,
          label: s.label,
          percent: Number(s.percent),
          value: Number(s.value),
          status: s.status,
        })),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Comissão — ${sale.developmentName} · ${sale.unitNumber}`}
      width={620}
      footer={
        <button type="button" className="inc-btn inc-btn--secondary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      {splits.length === 0 ? (
        <p className="inc-help">Nenhuma comissão lançada.</p>
      ) : (
        <div className="inc-card" style={{ marginBottom: "18px" }}>
          <table className="inc-table" style={{ border: 0 }}>
            <thead>
              <tr>
                <th>Beneficiário</th>
                <th>%</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {splits.map((split) => (
                <tr key={split.id}>
                  <td>
                    {COMMISSION_BENEFICIARY_LABELS[split.beneficiaryType]}
                    {split.label ? ` (${split.label})` : ""}
                  </td>
                  <td className="is-num">{split.percent}%</td>
                  <td className="is-num">{formatCurrency(split.value)}</td>
                  <td className="is-muted">{COMMISSION_STATUS_LABELS[split.status] ?? split.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Lançar comissão</div>
        <form action={dispatch}>
          <input type="hidden" name="saleId" value={sale.id} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
            <label className="inc-field">
              <span className="inc-label">Beneficiário *</span>
              <select id="beneficiaryType" name="beneficiaryType" className="inc-select" required defaultValue="">
                <option value="" disabled>
                  Selecione...
                </option>
                <option value="BROKER">Corretor</option>
                <option value="AGENCY">Imobiliária</option>
                <option value="COORDINATOR">Coordenador</option>
                <option value="MANAGER">Gerente</option>
                <option value="CAMPAIGN">Campanha</option>
              </select>
            </label>
            <label className="inc-field">
              <span className="inc-label">Corretor</span>
              <select id="brokerId" name="brokerId" className="inc-select" defaultValue="">
                <option value="">—</option>
                {brokers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="inc-field">
              <span className="inc-label">Imobiliária</span>
              <select id="agencyId" name="agencyId" className="inc-select" defaultValue="">
                <option value="">—</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="inc-field">
              <span className="inc-label">Nome (coordenador/campanha)</span>
              <input id="label" name="label" className="inc-input" />
            </label>
            <label className="inc-field">
              <span className="inc-label">Percentual (%) *</span>
              <input id="percent" name="percent" type="number" step="0.01" className="inc-input" required />
            </label>
          </div>
          {state.error ? <p className="inc-help inc-help--error" style={{ marginTop: "10px" }}>{state.error}</p> : null}
          <button type="submit" className="inc-btn inc-btn--primary" disabled={pending} style={{ marginTop: "14px" }}>
            {pending ? "Salvando..." : "Lançar comissão"}
          </button>
        </form>
      </div>
    </Modal>
  );
}
