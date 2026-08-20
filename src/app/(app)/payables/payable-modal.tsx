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
  setPayableAllocationsAction,
  createAllocationTemplateAction,
  applyAllocationTemplateAction,
  type FormState,
} from "./actions";
import type { Option } from "./payables-manager";
import type { AllocationDestinationInput } from "@/server/payable-allocations";
import { formatCurrencyBRL, formatDateBR, formatDateTimeBR, formatCalendarDateBR } from "@/lib/format";

export type PayableDetail = NonNullable<Awaited<ReturnType<typeof getPayableDetailAction>>>;

export type AllocationTemplateOption = {
  id: string;
  name: string;
  destinations: { developmentId: string | null; developmentName: string | null; percent: number }[];
};

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
  allocationTemplates,
  onClose,
  onCreated,
}: {
  mode: "create" | "edit";
  payable: PayableDetail | null;
  developments: Option[];
  spes: Option[];
  suppliers: Option[];
  costCenters: Option[];
  allocationTemplates: AllocationTemplateOption[];
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
    {
      id: "rateio",
      label: "Rateio",
      disabled: dependentTabsDisabled,
      disabledHint: "Salve a conta primeiro.",
    },
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
          <button type="button" className="inc-btn inc-btn--secondary" onClick={onClose}>
            Fechar
          </button>
          {!isLocked ? (
            <button type="button" className="inc-btn inc-btn--primary" disabled={pending} onClick={submitForm}>
              {pending ? "Salvando..." : "Salvar"}
            </button>
          ) : null}
        </>
      }
    >
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {isLocked ? (
        <p className="inc-help" style={{ marginTop: 0 }}>
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
          <div hidden={activeTab !== "dados"} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div>
              <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Identificação</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                <label className="inc-field" style={{ gridColumn: "1 / -1" }}>
                  <span className="inc-label">Descrição *</span>
                  <input
                    id="description"
                    name="description"
                    className="inc-input"
                    required
                    defaultValue={payable?.description ?? ""}
                  />
                </label>
                <label className="inc-field">
                  <span className="inc-label">Categoria *</span>
                  <select id="category" name="category" className="inc-select" required defaultValue={payable?.category ?? ""}>
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
                  <span className="inc-label">Empreendimento</span>
                  <select id="developmentId" name="developmentId" className="inc-select" defaultValue={payable?.developmentId ?? ""}>
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
                  <select id="speId" name="speId" className="inc-select" defaultValue={payable?.speId ?? ""}>
                    <option value="">—</option>
                    {spes.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inc-field">
                  <span className="inc-label">Fornecedor</span>
                  <select id="supplierId" name="supplierId" className="inc-select" defaultValue={payable?.supplierId ?? ""}>
                    <option value="">—</option>
                    {suppliers.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inc-field">
                  <span className="inc-label">Centro de custo</span>
                  <select id="costCenterId" name="costCenterId" className="inc-select" defaultValue={payable?.costCenterId ?? ""}>
                    <option value="">—</option>
                    {costCenters.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div>
              <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Valores e datas</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "14px" }}>
                <label className="inc-field">
                  <span className="inc-label">Competência *</span>
                  <input
                    id="competenceDate"
                    name="competenceDate"
                    type="date"
                    className="inc-input"
                    required
                    defaultValue={payable ? toDateInputValue(payable.competenceDate) : ""}
                  />
                </label>
                <label className="inc-field">
                  <span className="inc-label">Vencimento *</span>
                  <input
                    id="dueDate"
                    name="dueDate"
                    type="date"
                    className="inc-input"
                    required
                    defaultValue={payable ? toDateInputValue(payable.dueDate) : ""}
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
                    defaultValue={payable ? Number(payable.amount) : ""}
                  />
                </label>
                <label className="inc-field">
                  <span className="inc-label">Documento fiscal (nº NF)</span>
                  <input
                    id="fiscalDocument"
                    name="fiscalDocument"
                    className="inc-input"
                    placeholder="Número da nota fiscal"
                    defaultValue={payable?.fiscalDocument ?? ""}
                  />
                </label>
              </div>
            </div>

            <div>
              <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Observações</div>
              <label className="inc-field">
                <textarea id="notes" name="notes" className="inc-input" rows={3} defaultValue={payable?.notes ?? ""} />
              </label>
            </div>
          </div>

          <div hidden={activeTab !== "pagamento"}>
            <div>
              <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Pagamento</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <label className="inc-field">
                  <span className="inc-label">Forma de pagamento</span>
                  <input
                    id="paymentMethod"
                    name="paymentMethod"
                    className="inc-input"
                    placeholder="PIX, boleto, TED..."
                    defaultValue={payable?.paymentMethod ?? ""}
                  />
                </label>
                <label className="inc-field">
                  <span className="inc-label">Conta bancária</span>
                  <input id="bankAccount" name="bankAccount" className="inc-input" defaultValue={payable?.bankAccount ?? ""} />
                </label>
              </div>
              {payable?.paidAt ? (
                <p className="inc-help" style={{ marginTop: "10px" }}>
                  Pago em {formatCalendarDateBR(payable.paidAt)} —{" "}
                  {formatCurrencyBRL(Number(payable.paidAmount))}
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

      <div hidden={activeTab !== "rateio"}>
        {isEditing ? (
          <AllocationsTab
            payable={payable!}
            developments={developments}
            allocationTemplates={allocationTemplates}
            onUpdated={onCreated}
          />
        ) : null}
      </div>

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
        <p className="inc-help" style={{ marginTop: 0 }}>Nenhum anexo enviado.</p>
      ) : (
        <table className="inc-table" style={{ marginBottom: "16px" }}>
          <thead>
            <tr>
              <th>Arquivo</th>
              <th>Categoria</th>
              <th>Enviado por</th>
              <th>Enviado em</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {payable.documents.map((doc) => (
              <tr key={doc.id}>
                <td className="is-key">{doc.fileName}</td>
                <td>{DOCUMENT_CATEGORY_LABELS[doc.category] ?? doc.category}</td>
                <td className="is-muted">{doc.uploadedByName ?? "—"}</td>
                <td className="is-muted">{formatDateBR(doc.createdAt)}</td>
                <td>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    {doc.signedUrl ? (
                      <a
                        className="inc-btn-icon"
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
                      className="inc-btn-icon"
                      aria-label={`Remover ${doc.fileName}`}
                      disabled={busy}
                      onClick={() => handleDelete(doc.id)}
                      style={{ color: "var(--inc-danger)" }}
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

      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Enviar anexo</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <label className="inc-field">
            <span className="inc-label">Categoria</span>
            <select className="inc-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="inc-field">
            <span className="inc-label">Arquivo</span>
            <input className="inc-input" ref={fileInputRef} type="file" />
          </label>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <button
          type="button"
          className="inc-btn inc-btn--secondary"
          style={{ marginTop: "12px" }}
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
    <div>
      <div className="inc-eyebrow" style={{ marginBottom: "4px" }}>Itens</div>
      <p className="inc-help" style={{ marginTop: 0, marginBottom: "10px" }}>
        Detalhamento opcional do valor total. Quando preenchido, a soma dos itens precisa bater exato com o
        valor total lançado na aba Dados.
      </p>

      {items.length === 0 ? (
        <p className="inc-help">Nenhum item lançado — o valor total fica sem detalhamento.</p>
      ) : (
        <table className="inc-table" style={{ marginBottom: "12px" }}>
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
                    className="inc-input"
                    value={item.description}
                    onChange={(e) => updateItem(index, { description: e.target.value })}
                    placeholder="Descrição do item"
                  />
                </td>
                <td>
                  <input
                    className="inc-input"
                    type="number"
                    step="0.01"
                    value={item.amount}
                    onChange={(e) => updateItem(index, { amount: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="inc-btn-icon"
                    aria-label={`Remover item ${index + 1}`}
                    onClick={() => removeItem(index)}
                    style={{ color: "var(--inc-danger)" }}
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="inc-help">
        Soma dos itens:{" "}
        {formatCurrencyBRL(sum)}
      </p>

      <button type="button" className="inc-btn inc-btn--secondary" onClick={addItem}>
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
    <div style={{ marginBottom: "18px" }}>
      <div className="inc-eyebrow" style={{ marginBottom: "6px" }}>Histórico de aprovação</div>
      <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12.5px", color: "var(--inc-text-secondary)" }}>
        {history.map((entry) => (
          <li key={entry.id}>
            {STATUS_LABELS[entry.fromStatus] ?? entry.fromStatus} → {STATUS_LABELS[entry.toStatus] ?? entry.toStatus}
            {" — "}
            {entry.actorName} em {formatDateTimeBR(entry.occurredAt)}
          </li>
        ))}
      </ul>
    </div>
  );
}

type AllocationRow = { developmentId: string | null; percent: string; amount: string };

const formatMoney = formatCurrencyBRL;

function AllocationsTab({
  payable,
  developments,
  allocationTemplates,
  onUpdated,
}: {
  payable: PayableDetail;
  developments: Option[];
  allocationTemplates: AllocationTemplateOption[];
  onUpdated: (payable: PayableDetail) => void;
}) {
  const total = Number(payable.amount);
  const isLocked = payable.status !== "ENTERED";
  const hasAllocations = payable.allocations.length > 0;

  const [editing, setEditing] = useState(hasAllocations);
  const [rows, setRows] = useState<AllocationRow[]>(
    payable.allocations.map((a) => ({
      developmentId: a.developmentId,
      percent: a.percent !== null ? String(a.percent) : "",
      amount: String(a.amount),
    })),
  );
  const [templateId, setTemplateId] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sum = rows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);

  async function refresh() {
    const detail = await getPayableDetailAction(payable.id);
    if (detail) onUpdated(detail);
  }

  function addRow() {
    setRows((prev) => [...prev, { developmentId: null, percent: "", amount: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index: number, patch: Partial<AllocationRow>) {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        // Digitar o percentual recalcula o valor automaticamente — o usuário
        // ainda pode sobrescrever o valor à mão depois (modo "valor fixo").
        if (patch.percent !== undefined) {
          const pct = Number(patch.percent);
          next.amount = Number.isNaN(pct) ? next.amount : String(Math.round(total * pct) / 100);
        }
        return next;
      }),
    );
  }

  async function handleApplyTemplate(id: string) {
    setTemplateId(id);
    if (!id) return;
    setBusy(true);
    setError(null);
    const result = await applyAllocationTemplateAction(id, total);
    setBusy(false);
    if (result.error || !result.destinations) {
      setError(result.error ?? "Falha ao aplicar modelo.");
      return;
    }
    setRows(
      result.destinations.map((d) => ({
        developmentId: d.developmentId,
        percent: d.percent !== null && d.percent !== undefined ? String(d.percent) : "",
        amount: String(d.amount),
      })),
    );
  }

  async function handleSave() {
    setError(null);
    const destinations: AllocationDestinationInput[] = rows.map((row) => ({
      developmentId: row.developmentId,
      percent: row.percent.trim() ? Number(row.percent) : null,
      amount: Number(row.amount),
    }));

    setBusy(true);
    const result = await setPayableAllocationsAction(payable.id, destinations);
    if (result.error) {
      setBusy(false);
      setError(result.error);
      return;
    }

    if (saveAsTemplate && templateName.trim()) {
      const percentDestinations = rows.map((row) => ({
        developmentId: row.developmentId,
        percent: row.percent.trim() ? Number(row.percent) : Math.round((Number(row.amount) / total) * 10000) / 100,
      }));
      const templateResult = await createAllocationTemplateAction(templateName.trim(), percentDestinations);
      if (templateResult.error) {
        setBusy(false);
        setError(`Rateio salvo, mas o modelo não foi salvo: ${templateResult.error}`);
        await refresh();
        return;
      }
    }

    setBusy(false);
    setEditing(false);
    await refresh();
  }

  async function handleRemove() {
    if (!confirm("Remover o rateio? A conta volta a ser 100% no empreendimento único.")) return;
    setBusy(true);
    const result = await setPayableAllocationsAction(payable.id, []);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRows([]);
    setEditing(false);
    await refresh();
  }

  if (!editing) {
    return (
      <div>
        <div className="inc-eyebrow" style={{ marginBottom: "8px" }}>Rateio</div>
        {hasAllocations ? (
          <table className="inc-table" style={{ marginBottom: "12px" }}>
            <thead>
              <tr>
                <th>Destino</th>
                <th>%</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {payable.allocations.map((a) => (
                <tr key={a.id}>
                  <td className="is-key">{a.development?.name ?? "Organização"}</td>
                  <td>{a.percent !== null ? `${a.percent}%` : "—"}</td>
                  <td className="is-num">{formatMoney(Number(a.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="inc-help" style={{ marginTop: 0 }}>
            Sem rateio configurado — 100% em {payable.development?.name ?? "Organização"}.
          </p>
        )}
        {!isLocked ? (
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="inc-btn inc-btn--secondary" onClick={() => setEditing(true)}>
              {hasAllocations ? "Editar rateio" : "Configurar rateio"}
            </button>
            {hasAllocations ? (
              <button type="button" className="inc-btn inc-btn--secondary" disabled={busy} onClick={handleRemove}>
                Remover rateio
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="inc-eyebrow" style={{ marginBottom: "4px" }}>Rateio</div>
      <p className="inc-help" style={{ marginTop: 0, marginBottom: "10px" }}>
        Divida o valor total ({formatMoney(total)}) entre N destinos (empreendimentos e/ou organização), por
        percentual ou valor fixo — a soma precisa bater exato com o valor total.
      </p>

      {allocationTemplates.length > 0 ? (
        <label className="inc-field" style={{ maxWidth: 320, marginBottom: "12px" }}>
          <span className="inc-label">Aplicar modelo salvo</span>
          <select
            id="allocation-template"
            className="inc-select"
            value={templateId}
            onChange={(e) => handleApplyTemplate(e.target.value)}
            disabled={busy}
          >
            <option value="">Selecione...</option>
            {allocationTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <table className="inc-table" style={{ marginBottom: "12px" }}>
        <thead>
          <tr>
            <th>Destino</th>
            <th style={{ width: 110 }}>%</th>
            <th style={{ width: 150 }}>Valor (R$)</th>
            <th aria-label="Ações" style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td>
                <select
                  className="inc-select"
                  value={row.developmentId ?? ""}
                  onChange={(e) => updateRow(index, { developmentId: e.target.value || null })}
                >
                  <option value="">Organização</option>
                  {developments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  className="inc-input"
                  type="number"
                  step="0.01"
                  value={row.percent}
                  onChange={(e) => updateRow(index, { percent: e.target.value })}
                  placeholder="—"
                />
              </td>
              <td>
                <input
                  className="inc-input"
                  type="number"
                  step="0.01"
                  value={row.amount}
                  onChange={(e) => updateRow(index, { amount: e.target.value, percent: "" })}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="inc-btn-icon"
                  aria-label={`Remover destino ${index + 1}`}
                  onClick={() => removeRow(index)}
                  style={{ color: "var(--inc-danger)" }}
                >
                  <TrashIcon />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="inc-help">
        Soma: {formatMoney(sum)} de {formatMoney(total)}
        {Math.round(sum * 100) === Math.round(total * 100) ? " — fecha certo." : " — ainda não fecha."}
      </p>

      <button type="button" className="inc-btn inc-btn--secondary" onClick={addRow} style={{ marginTop: "6px", marginBottom: "14px" }}>
        + Adicionar destino
      </button>

      <div style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            id="save-as-template"
            type="checkbox"
            checked={saveAsTemplate}
            onChange={(e) => setSaveAsTemplate(e.target.checked)}
          />
          <label htmlFor="save-as-template" className="inc-label" style={{ margin: 0 }}>
            Salvar este rateio como modelo pra reuso
          </label>
        </div>
        {saveAsTemplate ? (
          <input
            className="inc-input"
            placeholder='Nome do modelo (ex.: "Administrativo 50/30/20")'
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            style={{ marginTop: "8px" }}
          />
        ) : null}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" className="inc-btn inc-btn--primary" disabled={busy} onClick={handleSave}>
          {busy ? "Salvando..." : "Salvar rateio"}
        </button>
        <button
          type="button"
          className="inc-btn inc-btn--secondary"
          onClick={() => {
            setRows(
              payable.allocations.map((a) => ({
                developmentId: a.developmentId,
                percent: a.percent !== null ? String(a.percent) : "",
                amount: String(a.amount),
              })),
            );
            setEditing(false);
            setError(null);
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
