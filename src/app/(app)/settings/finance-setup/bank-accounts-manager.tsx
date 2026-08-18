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
      <div className="list-toolbar">
        <form className="list-search" action="/settings/finance-setup" method="get">
          <input type="hidden" name="bsort" value={sortBy} />
          <input type="hidden" name="bdir" value={sortDir} />
          <input type="search" name="bq" placeholder="Buscar por banco, agência ou conta" defaultValue={search} />
          <button type="submit" className="secondary">
            Buscar
          </button>
        </form>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
            {total} conta{total === 1 ? "" : "s"}
          </p>
          {canCreate ? (
            <button type="button" onClick={() => setModal({ mode: "create" })}>
              + Nova conta
            </button>
          ) : null}
        </div>
      </div>

      {deleteError ? <p className="error-text" style={{ marginBottom: "0.75rem" }}>{deleteError}</p> : null}

      <table className="data-table">
        <thead>
          <tr>
            <th className="sortable-th">
              <Link href={sortLink("bankName")}>
                <button type="button" tabIndex={-1}>
                  Banco
                  <SortIcon direction={sortBy === "bankName" ? sortDir : null} />
                </button>
              </Link>
            </th>
            <th>Agência/Conta</th>
            <th>Tipo</th>
            <th className="sortable-th">
              <Link href={sortLink("nickname")}>
                <button type="button" tabIndex={-1}>
                  Apelido
                  <SortIcon direction={sortBy === "nickname" ? sortDir : null} />
                </button>
              </Link>
            </th>
            <th>Situação</th>
            <th>Saldo inicial</th>
            {canEdit || canDelete ? <th aria-label="Ações" /> : null}
          </tr>
        </thead>
        <tbody>
          {bankAccounts.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ opacity: 0.7 }}>
                {search ? "Nenhuma conta encontrada." : "Nenhuma conta bancária cadastrada."}
              </td>
            </tr>
          ) : null}
          {bankAccounts.map((bankAccount) => (
            <tr key={bankAccount.id}>
              <td>{bankAccount.bankName}</td>
              <td>
                {bankAccount.agency} / {bankAccount.account}
              </td>
              <td>{TYPE_LABELS[bankAccount.type] ?? bankAccount.type}</td>
              <td>{bankAccount.nickname ?? "—"}</td>
              <td>{STATUS_LABELS[bankAccount.status] ?? bankAccount.status}</td>
              <td>
                {bankAccount.openingBalance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em{" "}
                {new Date(bankAccount.openingBalanceDate).toLocaleDateString("pt-BR")}
              </td>
              {canEdit || canDelete ? (
                <td>
                  <div className="row-actions">
                    {canEdit ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Editar ${bankAccount.bankName}`}
                        onClick={() => setModal({ mode: "edit", bankAccount })}
                      >
                        <EditIcon />
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="icon-btn danger"
                        aria-label={`Excluir ${bankAccount.bankName}`}
                        disabled={isPending}
                        onClick={() =>
                          handleDelete(bankAccount.id, `${bankAccount.bankName} — ${bankAccount.agency}/${bankAccount.account}`)
                        }
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
          <button type="button" className="secondary" onClick={onClose}>
            Fechar
          </button>
          <button type="button" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
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
        <div className="field-section">
          <div className="field-grid">
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="ba-bank">Banco (código + nome) *</label>
              <input
                id="ba-bank"
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
            </div>
            <div className="field">
              <label htmlFor="ba-agency">Agência *</label>
              <input id="ba-agency" name="agency" required defaultValue={bankAccount?.agency ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="ba-account">Conta *</label>
              <input id="ba-account" name="account" required defaultValue={bankAccount?.account ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="ba-type">Tipo *</label>
              <select id="ba-type" name="type" required defaultValue={bankAccount?.type ?? "CHECKING"}>
                <option value="CHECKING">Corrente</option>
                <option value="SAVINGS">Poupança</option>
                <option value="PAYMENT">Pagamento</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ba-status">Situação *</label>
              <select id="ba-status" name="status" required defaultValue={bankAccount?.status ?? "ACTIVE"}>
                <option value="ACTIVE">Ativa</option>
                <option value="CLOSED">Encerrada</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ba-nickname">Apelido/descrição</label>
              <input id="ba-nickname" name="nickname" defaultValue={bankAccount?.nickname ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="ba-pix-type">Tipo de chave Pix</label>
              <input
                id="ba-pix-type"
                name="pixKeyType"
                placeholder="CNPJ, e-mail, telefone, aleatória..."
                defaultValue={bankAccount?.pixKeyType ?? ""}
              />
            </div>
            <div className="field">
              <label htmlFor="ba-pix-value">Chave Pix</label>
              <input id="ba-pix-value" name="pixKeyValue" defaultValue={bankAccount?.pixKeyValue ?? ""} />
            </div>
          </div>
        </div>

        <div className="field-section">
          <h3>Saldo inicial</h3>
          <p className="field-hint">
            Ponto de partida do saldo acumulado no fluxo de caixa (Fase B) — lançado manualmente por enquanto; a
            conciliação bancária automática (Fase 2) passa a alimentar isso sozinha.
          </p>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="ba-opening-balance">Saldo inicial (R$)</label>
              <input
                id="ba-opening-balance"
                name="openingBalance"
                type="number"
                step="0.01"
                defaultValue={bankAccount ? bankAccount.openingBalance : 0}
              />
            </div>
            <div className="field">
              <label htmlFor="ba-opening-balance-date">Data do saldo</label>
              <input
                id="ba-opening-balance-date"
                name="openingBalanceDate"
                type="date"
                defaultValue={bankAccount ? bankAccount.openingBalanceDate.slice(0, 10) : toDateInputValue(new Date())}
              />
            </div>
          </div>
        </div>
        {state.error ? <p className="error-text">{state.error}</p> : null}
      </form>
    </Modal>
  );
}
