"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import {
  createBankAccountAction,
  updateBankAccountAction,
  deleteBankAccountAction,
  type FormState,
} from "./actions";
import type { BankAccountSortField } from "@/server/bank-accounts";
import { formatCurrencyBRL, formatCalendarDateBR } from "@/lib/format";

export type BankAccountRow = {
  id: string;
  bankCode: string | null;
  bankName: string;
  agency: string;
  account: string;
  type: string;
  pixKeyType: string | null;
  pixKeyValue: string | null;
  nickname: string | null;
  status: string;
  openingBalance: number;
  openingBalanceDate: string;
};

type ModalState = { mode: "create" } | { mode: "edit"; bankAccount: BankAccountRow } | null;

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

const initialState: FormState = {};

const TYPE_LABELS: Record<string, string> = {
  CHECKING: "Corrente",
  SAVINGS: "Poupança",
  PAYMENT: "Pagamento",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  CLOSED: "Encerrada",
};

const BANK_SUGGESTIONS = [
  "001 - Banco do Brasil",
  "033 - Santander",
  "104 - Caixa Econômica Federal",
  "237 - Bradesco",
  "260 - Nubank",
  "290 - PagBank",
  "336 - C6 Bank",
  "341 - Itaú Unibanco",
  "348 - Banco XP",
  "077 - Banco Inter",
  "422 - Banco Safra",
  "623 - Banco Pan",
  "756 - Sicoob",
  "748 - Sicredi",
  "208 - BTG Pactual",
];

export function BankAccountsManager({
  bankAccounts,
  total,
  page,
  totalPages,
  search,
  sortBy,
  sortDir,
  canCreate,
  canEdit,
  canDelete,
}: {
  bankAccounts: BankAccountRow[];
  total: number;
  page: number;
  totalPages: number;
  search: string;
  sortBy: BankAccountSortField;
  sortDir: "asc" | "desc";
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function sortLink(field: BankAccountSortField) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    const qs = new URLSearchParams();
    if (search) qs.set("bq", search);
    qs.set("bsort", field);
    qs.set("bdir", nextDir);
    return `/settings/finance-setup?${qs.toString()}#contas-bancarias`;
  }

  function pageLink(targetPage: number) {
    const qs = new URLSearchParams();
    if (search) qs.set("bq", search);
    qs.set("bsort", sortBy);
    qs.set("bdir", sortDir);
    qs.set("bpage", String(targetPage));
    return `/settings/finance-setup?${qs.toString()}#contas-bancarias`;
  }

  function handleDelete(id: string, label: string) {
    if (!confirm(`Excluir a conta "${label}"?`)) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteBankAccountAction(id);
      if (result.error) setDeleteError(result.error);
    });
  }

  return (
    <div id="contas-bancarias">
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
        <form className="inc-search" style={{ width: 320 }} action="/settings/finance-setup" method="get">
          <input type="hidden" name="bsort" value={sortBy} />
          <input type="hidden" name="bdir" value={sortDir} />
          <input type="search" name="bq" placeholder="Buscar por banco, agência ou conta" defaultValue={search} />
        </form>

        <span style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
          {total} conta{total === 1 ? "" : "s"}
        </span>

        {canCreate ? (
          <button
            type="button"
            className="inc-btn inc-btn--primary"
            style={{ marginLeft: "auto" }}
            onClick={() => setModal({ mode: "create" })}
          >
            + Nova conta
          </button>
        ) : null}
      </div>

      {deleteError ? <p className="error-text" style={{ marginBottom: "12px" }}>{deleteError}</p> : null}

      <div className="inc-card">
        <table className="inc-table" style={{ border: 0 }}>
          <thead>
            <tr>
              <th>
                <Link
                  href={sortLink("bankName")}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "inherit", textDecoration: "none" }}
                >
                  Banco
                  <SortIcon direction={sortBy === "bankName" ? sortDir : null} />
                </Link>
              </th>
              <th>Agência/Conta</th>
              <th>Tipo</th>
              <th>
                <Link
                  href={sortLink("nickname")}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "inherit", textDecoration: "none" }}
                >
                  Apelido
                  <SortIcon direction={sortBy === "nickname" ? sortDir : null} />
                </Link>
              </th>
              <th>Situação</th>
              <th className="is-num">Saldo inicial</th>
              {canEdit || canDelete ? <th aria-label="Ações" /> : null}
            </tr>
          </thead>
          <tbody>
            {bankAccounts.length === 0 ? (
              <tr>
                <td colSpan={7} className="is-empty">
                  {search ? "Nenhuma conta encontrada." : "Nenhuma conta bancária cadastrada."}
                </td>
              </tr>
            ) : null}
            {bankAccounts.map((bankAccount) => (
              <tr key={bankAccount.id}>
                <td className="is-key">{bankAccount.bankName}</td>
                <td className="is-muted">
                  {bankAccount.agency} / {bankAccount.account}
                </td>
                <td className="is-muted">{TYPE_LABELS[bankAccount.type] ?? bankAccount.type}</td>
                <td className="is-muted">{bankAccount.nickname ?? "—"}</td>
                <td>
                  <span className={`inc-pill ${bankAccount.status === "ACTIVE" ? "inc-pill--ok" : ""}`}>
                    {bankAccount.status === "ACTIVE" ? <span className="inc-pill__dot" /> : null}
                    {STATUS_LABELS[bankAccount.status] ?? bankAccount.status}
                  </span>
                </td>
                <td className="is-num is-muted">
                  {formatCurrencyBRL(bankAccount.openingBalance)} em{" "}
                  {formatCalendarDateBR(bankAccount.openingBalanceDate)}
                </td>
                {canEdit || canDelete ? (
                  <td>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      {canEdit ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
                          aria-label={`Editar ${bankAccount.bankName}`}
                          onClick={() => setModal({ mode: "edit", bankAccount })}
                        >
                          <EditIcon />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
                          aria-label={`Excluir ${bankAccount.bankName}`}
                          disabled={isPending}
                          onClick={() =>
                            handleDelete(bankAccount.id, `${bankAccount.bankName} — ${bankAccount.agency}/${bankAccount.account}`)
                          }
                          style={{ color: "var(--inc-danger)" }}
                        >
                          <TrashIcon />
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
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

      {modal ? (
        <BankAccountModal
          mode={modal.mode}
          bankAccount={modal.mode === "edit" ? modal.bankAccount : null}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}

function BankAccountModal({
  mode,
  bankAccount,
  onClose,
}: {
  mode: "create" | "edit";
  bankAccount: BankAccountRow | null;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const formAction = mode === "create" ? createBankAccountAction : updateBankAccountAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);
  const [bankInput, setBankInput] = useState(
    bankAccount ? [bankAccount.bankCode, bankAccount.bankName].filter(Boolean).join(" - ") : "",
  );

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  function handleBankBlur() {
    const match = bankInput.match(/^(\d{1,3})\s*-\s*(.+)$/);
    if (match) setBankInput(`${match[1]} - ${match[2].trim()}`);
  }

  const [bankCode, bankName] = (() => {
    const match = bankInput.match(/^(\d{1,3})\s*-\s*(.+)$/);
    if (match) return [match[1], match[2].trim()];
    return ["", bankInput.trim()];
  })();

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "edit" ? `Editar conta — ${bankAccount!.bankName}` : "Nova conta bancária"}
      width={520}
      footer={
        <>
          <button type="button" className="inc-btn inc-btn--secondary" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="inc-btn inc-btn--primary" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
            {pending ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <form ref={formRef} action={dispatch}>
        {mode === "edit" && bankAccount ? (
          <input type="hidden" name="bankAccountId" value={bankAccount.id} />
        ) : null}
        <input type="hidden" name="bankCode" value={bankCode} />
        <input type="hidden" name="bankName" value={bankName} />
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Identificação</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
          <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
            <span className="inc-label">Banco (código + nome) *</span>
            <input
              id="ba-bank"
              className="inc-input"
              list="bank-suggestions"
              value={bankInput}
              onChange={(e) => setBankInput(e.target.value)}
              onBlur={handleBankBlur}
              placeholder="Ex.: 341 - Itaú Unibanco"
              required
            />
            <datalist id="bank-suggestions">
              {BANK_SUGGESTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label className="inc-field">
            <span className="inc-label">Agência *</span>
            <input id="ba-agency" name="agency" className="inc-input" required defaultValue={bankAccount?.agency ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Conta *</span>
            <input id="ba-account" name="account" className="inc-input" required defaultValue={bankAccount?.account ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Tipo *</span>
            <select id="ba-type" name="type" className="inc-select" required defaultValue={bankAccount?.type ?? "CHECKING"}>
              <option value="CHECKING">Corrente</option>
              <option value="SAVINGS">Poupança</option>
              <option value="PAYMENT">Pagamento</option>
            </select>
          </label>
          <label className="inc-field">
            <span className="inc-label">Situação *</span>
            <select id="ba-status" name="status" className="inc-select" required defaultValue={bankAccount?.status ?? "ACTIVE"}>
              <option value="ACTIVE">Ativa</option>
              <option value="CLOSED">Encerrada</option>
            </select>
          </label>
          <label className="inc-field">
            <span className="inc-label">Apelido/descrição</span>
            <input id="ba-nickname" name="nickname" className="inc-input" defaultValue={bankAccount?.nickname ?? ""} />
          </label>
          <label className="inc-field">
            <span className="inc-label">Tipo de chave Pix</span>
            <input
              id="ba-pix-type"
              name="pixKeyType"
              className="inc-input"
              placeholder="CNPJ, e-mail, telefone, aleatória..."
              defaultValue={bankAccount?.pixKeyType ?? ""}
            />
          </label>
          <label className="inc-field">
            <span className="inc-label">Chave Pix</span>
            <input id="ba-pix-value" name="pixKeyValue" className="inc-input" defaultValue={bankAccount?.pixKeyValue ?? ""} />
          </label>
        </div>

        <div className="inc-eyebrow" style={{ marginTop: "20px", marginBottom: "8px" }}>Saldo inicial</div>
        <p className="inc-help" style={{ marginTop: 0, marginBottom: "10px" }}>
          Ponto de partida do saldo acumulado no fluxo de caixa (Fase B) — lançado manualmente por enquanto; a
          conciliação bancária automática (Fase 2) passa a alimentar isso sozinha.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
          <label className="inc-field">
            <span className="inc-label">Saldo inicial (R$)</span>
            <input
              id="ba-opening-balance"
              name="openingBalance"
              type="number"
              step="0.01"
              className="inc-input"
              defaultValue={bankAccount ? bankAccount.openingBalance : 0}
            />
          </label>
          <label className="inc-field">
            <span className="inc-label">Data do saldo</span>
            <input
              id="ba-opening-balance-date"
              name="openingBalanceDate"
              type="date"
              className="inc-input"
              defaultValue={bankAccount ? bankAccount.openingBalanceDate.slice(0, 10) : toDateInputValue(new Date())}
            />
          </label>
        </div>
        {state.error ? <p className="error-text" style={{ marginTop: "14px" }}>{state.error}</p> : null}
      </form>
    </Modal>
  );
}
