"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { SortIcon } from "@/components/icons";
import { addCommissionSplitAction, getSaleCommissionSplitsAction, type FormState } from "./actions";
import type { SaleSortField } from "@/server/sales";

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

const WALLET_STATUS_LABELS: Record<string, string> = {
  EM_DIA: "Em dia",
  INADIMPLENTE: "Inadimplente",
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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
      <form className="list-toolbar" action="/sales" method="get" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <input type="hidden" name="sort" value={sortBy} />
        <input type="hidden" name="dir" value={sortDir} />
        <input
          type="search"
          name="q"
          placeholder="Buscar por nº, empreendimento, unidade ou cliente"
          defaultValue={search}
        />
        <select name="contractStatus" defaultValue={contractStatus}>
          <option value="">Status do contrato — todos</option>
          <option value="NONE">Sem contrato</option>
          {Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="walletStatus" defaultValue={walletStatus}>
          <option value="">Carteira — todas</option>
          <option value="EM_DIA">Em dia</option>
          <option value="INADIMPLENTE">Inadimplente</option>
        </select>
        <select name="brokerId" defaultValue={brokerId}>
          <option value="">Corretor — todos</option>
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <select name="agencyId" defaultValue={agencyId}>
          <option value="">Imobiliária — todas</option>
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
          De
          <input type="date" name="dateFrom" defaultValue={dateFrom} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
          Até
          <input type="date" name="dateTo" defaultValue={dateTo} />
        </label>
        <button type="submit" className="secondary">
          Filtrar
        </button>
        <a href={exportHref} className="secondary" style={{ marginLeft: "auto" }}>
          Exportar (CSV)
        </a>
      </form>

      <p style={{ fontSize: "0.85rem", opacity: 0.75, marginTop: "0.5rem" }}>
        {total} venda{total === 1 ? "" : "s"}
      </p>

      <table className="data-table">
        <thead>
          <tr>
            <th>Nº</th>
            {SORTABLE_COLUMNS.map((col) => (
              <th key={col.field} className="sortable-th">
                <Link href={sortLink(col.field)}>
                  <button type="button" tabIndex={-1}>
                    {col.label}
                    <SortIcon direction={sortBy === col.field ? sortDir : null} />
                  </button>
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
              <td colSpan={10} style={{ opacity: 0.7 }}>
                {search ? "Nenhuma venda encontrada." : "Nenhuma venda registrada."}
              </td>
            </tr>
          ) : null}
          {sales.map((sale) => (
            <tr key={sale.id}>
              <td>{sale.saleNumber}</td>
              <td>{new Date(sale.saleDate).toLocaleDateString("pt-BR")}</td>
              <td>{sale.developmentName}</td>
              <td>{sale.customerName}</td>
              <td>{formatCurrency(sale.salePrice)}</td>
              <td>{sale.unitNumber}</td>
              <td>{sale.contractStatus ? (CONTRACT_STATUS_LABELS[sale.contractStatus] ?? sale.contractStatus) : "Sem contrato"}</td>
              <td>{sale.walletStatus ? WALLET_STATUS_LABELS[sale.walletStatus] : "—"}</td>
              <td>{sale.brokerName ?? sale.agencyName ?? "—"}</td>
              <td>{sale.commissionSplits.length > 0 ? `${sale.commissionSplits.length} lançada(s)` : "—"}</td>
              <td>
                <div className="row-actions">
                  <Link href={`/sales/${sale.id}`}>Ver venda</Link>
                  {canEditCommission ? (
                    <button type="button" className="secondary" onClick={() => setCommissionSale(sale)}>
                      Comissão
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pagination">
        {page > 1 ? <Link href={pageLink(page - 1)}>← Anterior</Link> : <span className="disabled">← Anterior</span>}
        <span>
          Página {page} de {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={pageLink(page + 1)}>Próxima →</Link>
        ) : (
          <span className="disabled">Próxima →</span>
        )}
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
        <button type="button" className="secondary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      {splits.length === 0 ? (
        <p className="field-hint">Nenhuma comissão lançada.</p>
      ) : (
        <table className="data-table" style={{ marginBottom: "1rem" }}>
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
                <td>{split.percent}%</td>
                <td>{formatCurrency(split.value)}</td>
                <td>{COMMISSION_STATUS_LABELS[split.status] ?? split.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="field-section">
        <h3>Lançar comissão</h3>
        <form action={dispatch}>
          <input type="hidden" name="saleId" value={sale.id} />
          <div className="field-grid">
            <div className="field">
              <label htmlFor="beneficiaryType">Beneficiário *</label>
              <select id="beneficiaryType" name="beneficiaryType" required defaultValue="">
                <option value="" disabled>
                  Selecione...
                </option>
                <option value="BROKER">Corretor</option>
                <option value="AGENCY">Imobiliária</option>
                <option value="COORDINATOR">Coordenador</option>
                <option value="MANAGER">Gerente</option>
                <option value="CAMPAIGN">Campanha</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="brokerId">Corretor</label>
              <select id="brokerId" name="brokerId" defaultValue="">
                <option value="">—</option>
                {brokers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="agencyId">Imobiliária</label>
              <select id="agencyId" name="agencyId" defaultValue="">
                <option value="">—</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="label">Nome (coordenador/campanha)</label>
              <input id="label" name="label" />
            </div>
            <div className="field">
              <label htmlFor="percent">Percentual (%) *</label>
              <input id="percent" name="percent" type="number" step="0.01" required />
            </div>
          </div>
          {state.error ? <p className="error-text">{state.error}</p> : null}
          <button type="submit" disabled={pending} style={{ marginTop: "0.75rem" }}>
            {pending ? "Salvando..." : "Lançar comissão"}
          </button>
        </form>
      </div>
    </Modal>
  );
}
