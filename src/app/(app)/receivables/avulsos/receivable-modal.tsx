"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import {
  createReceivableAction,
  updateReceivableAction,
  getReceivableDetailAction,
  registerReceivableReceiptAction,
  type FormState,
} from "./actions";
import type { Option } from "./receivables-manager";
import { formatCurrencyBRL, formatCalendarDateBR } from "@/lib/format";

export type ReceivableDetail = NonNullable<Awaited<ReturnType<typeof getReceivableDetailAction>>>;

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "ASSIGNMENT_FEE", label: "Taxa de cessão" },
  { value: "SPACE_RENTAL", label: "Aluguel de espaço" },
  { value: "REFUND", label: "Reembolso" },
  { value: "YIELD", label: "Rendimento" },
  { value: "OTHER", label: "Outro" },
];

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  RECEIVED: "Recebido",
  CANCELLED: "Cancelado",
};

function toDateInputValue(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

const initialState: FormState = {};

export function ReceivableModal({
  mode,
  receivable,
  developments,
  spes,
  customers,
  onClose,
  onCreated,
}: {
  mode: "create" | "edit";
  receivable: ReceivableDetail | null;
  developments: Option[];
  spes: Option[];
  customers: Option[];
  onClose: () => void;
  onCreated: (receivable: ReceivableDetail) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const formAction = mode === "create" ? createReceivableAction : updateReceivableAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);

  useEffect(() => {
    if (!state.success || !state.receivableId) return;
    getReceivableDetailAction(state.receivableId).then((detail) => {
      if (detail) onCreated(detail);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success, state.receivableId]);

  const isEditing = mode === "edit" && !!receivable;
  const isLocked = isEditing && receivable!.status !== "PENDING";
  const isFromAssignment = isEditing && !!receivable!.contractAssignmentId;

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? `Editar recebível — ${receivable!.origin}` : "Novo recebível avulso"}
      width={620}
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose}>
            Fechar
          </button>
          {!isLocked ? (
            <button type="button" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
              {pending ? "Salvando..." : "Salvar"}
            </button>
          ) : null}
        </>
      }
    >
      {isLocked ? (
        <p className="field-hint">
          Este recebível já foi {STATUS_LABELS[receivable!.status]?.toLowerCase()} — os dados não podem mais ser
          editados.
        </p>
      ) : null}
      {isFromAssignment ? (
        <p className="field-hint">
          Gerado automaticamente pela assinatura de uma cessão de direitos — não editável manualmente.
        </p>
      ) : null}

      {isEditing && receivable!.status === "PENDING" ? (
        <ReceiptForm receivable={receivable!} onUpdated={onCreated} />
      ) : null}
      {isEditing && receivable!.status === "RECEIVED" ? (
        <p className="field-hint">
          Recebido em {formatCalendarDateBR(receivable!.receivedAt!)} —{" "}
          {formatCurrencyBRL(Number(receivable!.receivedAmount))}
        </p>
      ) : null}

      <form ref={formRef} action={dispatch}>
        {mode === "edit" && receivable ? (
          <input type="hidden" name="receivableId" value={receivable.id} />
        ) : null}

        <fieldset disabled={isLocked || isFromAssignment} style={{ border: "none", padding: 0, margin: 0 }}>
          <div className="field-section">
            <h3>Identificação</h3>
            <div className="field-grid">
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="origin">Origem *</label>
                <input
                  id="origin"
                  name="origin"
                  required
                  placeholder='Ex.: "Aluguel do espaço comum — julho/2026"'
                  defaultValue={receivable?.origin ?? ""}
                />
              </div>
              <div className="field">
                <label htmlFor="category">Categoria *</label>
                <select id="category" name="category" required defaultValue={receivable?.category ?? ""}>
                  <option value="" disabled>
                    Selecione...
                  </option>
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="customerId">Cliente/pagador</label>
                <select id="customerId" name="customerId" defaultValue={receivable?.customerId ?? ""}>
                  <option value="">—</option>
                  {customers.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="developmentId">Empreendimento</label>
                <select id="developmentId" name="developmentId" defaultValue={receivable?.developmentId ?? ""}>
                  <option value="">Organização (nenhum específico)</option>
                  {developments.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="speId">SPE</label>
                <select id="speId" name="speId" defaultValue={receivable?.speId ?? ""}>
                  <option value="">—</option>
                  {spes.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="field-section">
            <h3>Valores e datas</h3>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="dueDate">Vencimento *</label>
                <input
                  id="dueDate"
                  name="dueDate"
                  type="date"
                  required
                  defaultValue={receivable ? toDateInputValue(receivable.dueDate) : ""}
                />
              </div>
              <div className="field">
                <label htmlFor="amount">Valor (R$) *</label>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                  defaultValue={receivable ? Number(receivable.amount) : ""}
                />
              </div>
            </div>
          </div>

          <div className="field-section">
            <h3>Observações</h3>
            <div className="field">
              <textarea id="notes" name="notes" rows={3} defaultValue={receivable?.notes ?? ""} />
            </div>
          </div>
        </fieldset>

        {state.error ? <p className="error-text">{state.error}</p> : null}
      </form>
    </Modal>
  );
}

function ReceiptForm({
  receivable,
  onUpdated,
}: {
  receivable: ReceivableDetail;
  onUpdated: (receivable: ReceivableDetail) => void;
}) {
  const [receivedAt, setReceivedAt] = useState(toDateInputValue(new Date()));
  const [receivedAmount, setReceivedAmount] = useState(String(Number(receivable.amount)));
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    const formData = new FormData();
    formData.set("receivableId", receivable.id);
    formData.set("receivedAt", receivedAt);
    formData.set("receivedAmount", receivedAmount);
    await registerReceivableReceiptAction(formData);
    const detail = await getReceivableDetailAction(receivable.id);
    setBusy(false);
    if (detail) onUpdated(detail);
  }

  return (
    <div className="field-section">
      <h3>Registrar recebimento</h3>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="receivedAt">Data do recebimento</label>
          <input id="receivedAt" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="receivedAmount">Valor recebido (R$)</label>
          <input
            id="receivedAmount"
            type="number"
            step="0.01"
            value={receivedAmount}
            onChange={(e) => setReceivedAmount(e.target.value)}
          />
        </div>
      </div>
      <button type="button" className="secondary" disabled={busy} onClick={handleSubmit} style={{ marginTop: "0.5rem" }}>
        {busy ? "Registrando..." : "Registrar recebimento"}
      </button>
    </div>
  );
}
