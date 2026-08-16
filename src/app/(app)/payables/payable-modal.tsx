"use client";

import { useActionState, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Modal } from "@/components/Modal";
import { Tabs, type TabDef } from "@/components/Tabs";
import { TrashIcon, DownloadIcon } from "@/components/icons";
import {
  createPayableAction,
  updatePayableAction,
  getPayableDetailAction,
  uploadPayableDocumentAction,
  deletePayableDocumentAction,
  type FormState,
} from "./actions";
import type { Option } from "./payables-manager";

export type PayableDetail = NonNullable<Awaited<ReturnType<typeof getPayableDetailAction>>>;

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "CONSTRUCTION", label: "Construtora" },
  { value: "LAND", label: "Terreno" },
  { value: "PROJECTS", label: "Projetos" },
  { value: "APPROVALS", label: "Aprovações" },
  { value: "NOTARY", label: "Cartório" },
  { value: "MARKETING", label: "Marketing" },
  { value: "AGENCY", label: "Agência" },
  { value: "MEDIA", label: "Mídia" },
  { value: "SALES_BOOTH", label: "Estande de vendas" },
  { value: "SALES_BOOTH_MAINTENANCE", label: "Manutenção do estande" },
  { value: "SALES_TEAM", label: "Equipe comercial" },
  { value: "BROKERAGE", label: "Corretagem" },
  { value: "FEES", label: "Taxas" },
  { value: "TAXES", label: "Impostos" },
  { value: "LEGAL", label: "Jurídico" },
  { value: "ACCOUNTING", label: "Contabilidade" },
  { value: "INSURANCE", label: "Seguros" },
  { value: "BANK_FEES", label: "Despesas bancárias" },
  { value: "UTILITIES", label: "Concessionárias" },
  { value: "ADMINISTRATION", label: "Administração" },
  { value: "CANCELLATION_REFUND", label: "Devolução de distrato" },
  { value: "OTHER", label: "Despesas diversas" },
];

const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  FISCAL_DOCUMENT: "Documento fiscal (NF/boleto/recibo)",
  PROOF: "Comprovante",
  CONTRACT: "Contrato",
  REPORT: "Relatório",
  PLAN: "Planta",
  MEMORIAL: "Memorial descritivo",
  REGISTRATION: "Matrícula",
  OTHER: "Outro",
};

const STATUS_LABELS: Record<string, string> = {
  ENTERED: "Lançada",
  REVIEWED: "Conferida",
  APPROVED: "Aprovada",
  SCHEDULED: "Programada",
  PAID: "Paga",
  RECONCILED: "Conciliada",
  CANCELLED: "Cancelada",
};

function toDateInputValue(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

const initialState: FormState = {};

export function PayableModal({
  mode,
  payable,
  developments,
  spes,
  suppliers,
  costCenters,
  onClose,
  onCreated,
}: {
  mode: "create" | "edit";
  payable: PayableDetail | null;
  developments: Option[];
  spes: Option[];
  suppliers: Option[];
  costCenters: Option[];
  onClose: () => void;
  onCreated: (payable: PayableDetail) => void;
}) {
  const [activeTab, setActiveTab] = useState("dados");
  const formRef = useRef<HTMLFormElement>(null);
  const itemsJsonRef = useRef<HTMLInputElement>(null);
  const formAction = mode === "create" ? createPayableAction : updatePayableAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);
  const [items, setItems] = useState<{ description: string; amount: string }[]>(
    payable?.items.map((item) => ({ description: item.description, amount: String(item.amount) })) ?? [],
  );

  function submitForm() {
    // Serializa os itens no campo oculto ANTES de disparar o submit — fazer
    // isso num handler de onSubmit no <form> corre risco de rodar depois que
    // o React 19 já capturou o FormData pra Server Action.
    if (itemsJsonRef.current) {
      itemsJsonRef.current.value = JSON.stringify(
        items
          .filter((item) => item.description.trim() && item.amount.trim())
          .map((item) => ({ description: item.description.trim(), amount: Number(item.amount) })),
      );
    }
    formRef.current?.requestSubmit();
  }

  useEffect(() => {
    if (!state.success || !state.payableId) return;
    getPayableDetailAction(state.payableId).then((detail) => {
      if (detail) onCreated(detail);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success, state.payableId]);

  const isEditing = mode === "edit" && !!payable;
  const isLocked = isEditing && payable!.status !== "ENTERED";
  const dependentTabsDisabled = !isEditing;

  const tabs: TabDef[] = [
    { id: "dados", label: "Dados" },
    { id: "itens", label: "Itens" },
    { id: "pagamento", label: "Pagamento" },
    {
      id: "anexos",
      label: "Anexos",
      disabled: dependentTabsDisabled,
      disabledHint: "Salve a conta primeiro.",
    },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? `Editar conta a pagar — ${payable!.description}` : "Nova conta a pagar"}
      width={680}
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose}>
            Fechar
          </button>
          {!isLocked ? (
            <button type="button" disabled={pending} onClick={submitForm}>
              {pending ? "Salvando..." : "Salvar"}
            </button>
          ) : null}
        </>
      }
    >
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {isLocked ? (
        <p className="field-hint">
          Esta conta já saiu do status &quot;Lançada&quot; — os dados não podem mais ser
          editados. Se precisar corrigir, cancele e lance uma nova.
        </p>
      ) : null}

      {isEditing && payable!.approvalHistory.length > 0 ? (
        <ApprovalHistory history={payable!.approvalHistory} />
      ) : null}

      <form ref={formRef} action={dispatch}>
        {mode === "edit" && payable ? (
          <input type="hidden" name="payableId" value={payable.id} />
        ) : null}
        <input ref={itemsJsonRef} type="hidden" name="itemsJson" />

        <fieldset disabled={isLocked} style={{ border: "none", padding: 0, margin: 0 }}>
          <div hidden={activeTab !== "dados"}>
            <div className="field-section">
              <h3>Identificação</h3>
              <div className="field-grid">
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="description">Descrição *</label>
                  <input
                    id="description"
                    name="description"
                    required
                    defaultValue={payable?.description ?? ""}
                  />
                </div>
                <div className="field">
                  <label htmlFor="category">Categoria *</label>
                  <select id="category" name="category" required defaultValue={payable?.category ?? ""}>
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
                  <label htmlFor="developmentId">Empreendimento</label>
                  <select id="developmentId" name="developmentId" defaultValue={payable?.developmentId ?? ""}>
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
                  <select id="speId" name="speId" defaultValue={payable?.speId ?? ""}>
                    <option value="">—</option>
                    {spes.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="supplierId">Fornecedor</label>
                  <select id="supplierId" name="supplierId" defaultValue={payable?.supplierId ?? ""}>
                    <option value="">—</option>
                    {suppliers.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="costCenterId">Centro de custo</label>
                  <select id="costCenterId" name="costCenterId" defaultValue={payable?.costCenterId ?? ""}>
                    <option value="">—</option>
                    {costCenters.map((option) => (
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
                  <label htmlFor="competenceDate">Competência *</label>
                  <input
                    id="competenceDate"
                    name="competenceDate"
                    type="date"
                    required
                    defaultValue={payable ? toDateInputValue(payable.competenceDate) : ""}
                  />
                </div>
                <div className="field">
                  <label htmlFor="dueDate">Vencimento *</label>
                  <input
                    id="dueDate"
                    name="dueDate"
                    type="date"
                    required
                    defaultValue={payable ? toDateInputValue(payable.dueDate) : ""}
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
                    defaultValue={payable ? Number(payable.amount) : ""}
                  />
                </div>
                <div className="field">
                  <label htmlFor="fiscalDocument">Documento fiscal (nº NF)</label>
                  <input
                    id="fiscalDocument"
                    name="fiscalDocument"
                    placeholder="Número da nota fiscal"
                    defaultValue={payable?.fiscalDocument ?? ""}
                  />
                </div>
              </div>
            </div>

            <div className="field-section">
              <h3>Observações</h3>
              <div className="field">
                <textarea id="notes" name="notes" rows={3} defaultValue={payable?.notes ?? ""} />
              </div>
            </div>
          </div>

          <div hidden={activeTab !== "pagamento"}>
            <div className="field-section">
              <h3>Pagamento</h3>
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="paymentMethod">Forma de pagamento</label>
                  <input
                    id="paymentMethod"
                    name="paymentMethod"
                    placeholder="PIX, boleto, TED..."
                    defaultValue={payable?.paymentMethod ?? ""}
                  />
                </div>
                <div className="field">
                  <label htmlFor="bankAccount">Conta bancária</label>
                  <input id="bankAccount" name="bankAccount" defaultValue={payable?.bankAccount ?? ""} />
                </div>
              </div>
              {payable?.paidAt ? (
                <p className="field-hint">
                  Pago em {new Date(payable.paidAt).toLocaleDateString("pt-BR")} —{" "}
                  {Number(payable.paidAmount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              ) : null}
            </div>
          </div>

          <div hidden={activeTab !== "itens"}>
            <ItemsTab items={items} onChange={setItems} />
          </div>
        </fieldset>

        {state.error ? <p className="error-text">{state.error}</p> : null}
      </form>

      <div hidden={activeTab !== "anexos"}>
        {isEditing ? <DocumentsTab payable={payable!} onUpdated={onCreated} /> : null}
      </div>
    </Modal>
  );
}

function DocumentsTab({
  payable,
  onUpdated,
}: {
  payable: PayableDetail;
  onUpdated: (payable: PayableDetail) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("PROOF");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const detail = await getPayableDetailAction(payable.id);
    if (detail) onUpdated(detail);
  }

  async function handleUpload() {
    setError(null);
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Selecione um arquivo.");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    formData.set("category", category);

    setBusy(true);
    const result = await uploadPayableDocumentAction(payable.id, formData);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    await refresh();
  }

  async function handleDelete(documentId: string) {
    if (!confirm("Remover este anexo?")) return;
    setBusy(true);
    await deletePayableDocumentAction(documentId);
    setBusy(false);
    await refresh();
  }

  return (
    <div>
      {payable.documents.length === 0 ? (
        <p className="field-hint">Nenhum anexo enviado.</p>
      ) : (
        <table className="data-table" style={{ marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th>Arquivo</th>
              <th>Categoria</th>
              <th>Enviado em</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {payable.documents.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.fileName}</td>
                <td>{DOCUMENT_CATEGORY_LABELS[doc.category] ?? doc.category}</td>
                <td>{new Date(doc.createdAt).toLocaleDateString("pt-BR")}</td>
                <td>
                  <div className="row-actions">
                    {doc.signedUrl ? (
                      <a
                        className="icon-btn"
                        href={doc.signedUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Baixar ${doc.fileName}`}
                      >
                        <DownloadIcon />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="icon-btn danger"
                      aria-label={`Remover ${doc.fileName}`}
                      disabled={busy}
                      onClick={() => handleDelete(doc.id)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="field-section">
        <h3>Enviar anexo</h3>
        <div className="field-grid">
          <div className="field">
            <label>Categoria</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Arquivo</label>
            <input ref={fileInputRef} type="file" />
          </div>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <button
          type="button"
          className="secondary"
          style={{ marginTop: "0.75rem" }}
          disabled={busy}
          onClick={handleUpload}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}

type PayableItemRow = { description: string; amount: string };

function ItemsTab({
  items,
  onChange,
}: {
  items: PayableItemRow[];
  onChange: Dispatch<SetStateAction<PayableItemRow[]>>;
}) {
  const sum = items.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  function updateItem(index: number, patch: Partial<PayableItemRow>) {
    onChange((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    onChange((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    onChange((prev) => [...prev, { description: "", amount: "" }]);
  }

  return (
    <div className="field-section">
      <h3>Itens</h3>
      <p className="field-hint">
        Detalhamento opcional do valor total. Quando preenchido, a soma dos itens precisa bater exato com o
        valor total lançado na aba Dados.
      </p>

      {items.length === 0 ? (
        <p className="field-hint">Nenhum item lançado — o valor total fica sem detalhamento.</p>
      ) : (
        <table className="data-table" style={{ marginBottom: "0.75rem" }}>
          <thead>
            <tr>
              <th>Descrição</th>
              <th style={{ width: 160 }}>Valor (R$)</th>
              <th aria-label="Ações" style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index}>
                <td>
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(index, { description: e.target.value })}
                    placeholder="Descrição do item"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={item.amount}
                    onChange={(e) => updateItem(index, { amount: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label={`Remover item ${index + 1}`}
                    onClick={() => removeItem(index)}
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="field-hint">
        Soma dos itens:{" "}
        {sum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
      </p>

      <button type="button" className="secondary" onClick={addItem}>
        + Adicionar item
      </button>
    </div>
  );
}

function ApprovalHistory({
  history,
}: {
  history: { id: string; fromStatus: string; toStatus: string; actorName: string; occurredAt: string | Date }[];
}) {
  return (
    <div className="field-section" style={{ marginTop: 0 }}>
      <h3>Histórico de aprovação</h3>
      <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem" }}>
        {history.map((entry) => (
          <li key={entry.id}>
            {STATUS_LABELS[entry.fromStatus] ?? entry.fromStatus} → {STATUS_LABELS[entry.toStatus] ?? entry.toStatus}
            {" — "}
            {entry.actorName} em {new Date(entry.occurredAt).toLocaleString("pt-BR")}
          </li>
        ))}
      </ul>
    </div>
  );
}
