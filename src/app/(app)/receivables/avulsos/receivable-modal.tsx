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
          <button type="button" className="inc-btn inc-btn--secondary" onClick={onClose}>
            Fechar
          </button>
          {!isLocked ? (
            <button type="button" className="inc-btn inc-btn--primary" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
              {pending ? "Salvando..." : "Salvar"}
            </button>
          ) : null}
        </>
      }
    >
      {isLocked ? (
        <p className="inc-help">
          Este recebível já foi {STATUS_LABELS[receivable!.status]?.toLowerCase()} — os dados não podem mais ser
          editados.
        </p>
      ) : null}
      {isFromAssignment ? (
        <p className="inc-help">
          Gerado automaticamente pela assinatura de uma cessão de direitos — não editável manualmente.
        </p>
      ) : null}

      {isEditing && receivable!.status === "PENDING" ? (
        <ReceiptForm receivable={receivable!} onUpdated={onCreated} />
      ) : null}
      {isEditing && receivable!.status === "RECEIVED" ? (
        <p className="inc-help">
          Recebido em {formatCalendarDateBR(receivable!.receivedAt!)} —{" "}
          {formatCurrencyBRL(Number(receivable!.receivedAmount))}
        </p>
      ) : null}

      <form ref={formRef} action={dispatch}>
        {mode === "edit" && receivable ? (
          <input type="hidden" name="receivableId" value={receivable.id} />
        ) : null}

        <fieldset disabled={isLocked || isFromAssignment} style={{ border: "none", padding: 0, margin: 0 }}>
          <div style={{ marginBottom: "18px" }}>
            <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Identificação</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
              <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
                <span className="inc-label">Origem *</span>
                <input
                  id="origin"
                  name="origin"
                  className="inc-input"
                  required
                  placeholder='Ex.: "Aluguel do espaço comum — julho/2026"'
                  defaultValue={receivable?.origin ?? ""}
                />
              </label>
              <label className="inc-field">
                <span className="inc-label">Categoria *</span>
                <select id="category" name="category" className="inc-select" required defaultValue={receivable?.category ?? ""}>
                  <option value="" disabled>
                    Selecione...
                  </option>
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inc-field">
                <span className="inc-label">Cliente/pagador</span>
                <select id="customerId" name="customerId" className="inc-select" defaultValue={receivable?.customerId ?? ""}>
                  <option value="">—</option>
                  {customers.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inc-field">
                <span className="inc-label">Empreendimento</span>
                <select id="developmentId" name="developmentId" className="inc-select" defaultValue={receivable?.developmentId ?? ""}>
                  <option value="">Organização (nenhum específico)</option>
                  {developments.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inc-field">
                <span className="inc-label">SPE</span>
                <select id="speId" name="speId" className="inc-select" defaultValue={receivable?.speId ?? ""}>
                  <option value="">—</option>
                  {spes.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div style={{ marginBottom: "18px" }}>
            <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Valores e datas</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
              <label className="inc-field">
                <span className="inc-label">Vencimento *</span>
                <input
                  id="dueDate"
                  name="dueDate"
                  type="date"
                  className="inc-input"
                  required
                  defaultValue={receivable ? toDateInputValue(receivable.dueDate) : ""}
                />
              </label>
              <label className="inc-field">
                <span className="inc-label">Valor (R$) *</span>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  className="inc-input"
                  required
                  defaultValue={receivable ? Number(receivable.amount) : ""}
                />
              </label>
            </div>
          </div>

          <div>
            <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Observações</div>
            <label className="inc-field">
              <textarea
                id="notes"
                name="notes"
                className="inc-input"
                rows={3}
                style={{ height: "auto", padding: "var(--inc-space-6)" }}
                defaultValue={receivable?.notes ?? ""}
              />
            </label>
          </div>
        </fieldset>

        {state.error ? <p className="error-text" style={{ marginTop: "14px" }}>{state.error}</p> : null}
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
    <div className="inc-card" style={{ padding: "14px", marginBottom: "16px" }}>
      <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Registrar recebimento</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
        <label className="inc-field">
          <span className="inc-label">Data do recebimento</span>
          <input id="receivedAt" type="date" className="inc-input" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
        </label>
        <label className="inc-field">
          <span className="inc-label">Valor recebido (R$)</span>
          <input
            id="receivedAmount"
            type="number"
            step="0.01"
            className="inc-input"
            value={receivedAmount}
            onChange={(e) => setReceivedAmount(e.target.value)}
          />
        </label>
      </div>
      <button type="button" className="inc-btn inc-btn--secondary" disabled={busy} onClick={handleSubmit} style={{ marginTop: "12px" }}>
        {busy ? "Registrando..." : "Registrar recebimento"}
      </button>
    </div>
  );
}
