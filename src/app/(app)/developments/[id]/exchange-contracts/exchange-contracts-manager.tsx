"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  createExchangeContractAction,
  updateExchangeContractAction,
  deleteExchangeContractAction,
  uploadExchangeContractDocumentAction,
  type FormState,
} from "./actions";
import { formatCurrencyBRL, formatCalendarDateBR } from "@/lib/format";

export type ExchangeContractRow = {
  id: string;
  permutanteId: string;
  permutanteName: string;
  type: string;
  appraisalValue: number | null;
  contractDate: Date;
  notes: string | null;
  status: string;
  managedBySystem: boolean | null;
  administrationFeePct: number | null;
  landIds: string[];
  landLabels: string[];
  unitCount: number;
  unitNumbers: string[];
  contractDocumentPath: string | null;
};

type Option = { id: string; label: string };

const TYPE_LABELS: Record<string, string> = {
  PHYSICAL: "Física",
  FINANCIAL: "Financeira",
  MIXED: "Mista",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  SETTLED: "Quitado",
  TERMINATED: "Encerrado",
};

const formatCurrency = formatCurrencyBRL;

const initialState: FormState = {};

function ExchangeContractForm({
  developmentId,
  contract,
  permutantes,
  lands,
  onSaved,
  onCancel,
}: {
  developmentId: string;
  contract: ExchangeContractRow | null;
  permutantes: Option[];
  lands: Option[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const formAction = contract ? updateExchangeContractAction : createExchangeContractAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);
  const [type, setType] = useState(contract?.type ?? "PHYSICAL");
  const [managedBySystem, setManagedBySystem] = useState(contract?.managedBySystem ?? true);

  useEffect(() => {
    if (state.success) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={dispatch} className="field-section" style={{ marginTop: "0.75rem" }}>
      <h3>{contract ? "Editar contrato de permuta" : "Novo contrato de permuta"}</h3>
      <input type="hidden" name="developmentId" value={developmentId} />
      {contract ? <input type="hidden" name="contractId" value={contract.id} /> : null}

      <div className="field-grid">
        <div className="field">
          <label htmlFor="ec-permutante">Permutante *</label>
          <select id="ec-permutante" name="permutanteId" required defaultValue={contract?.permutanteId ?? ""}>
            <option value="" disabled>
              Selecione...
            </option>
            {permutantes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ec-type">Tipo *</label>
          <select
            id="ec-type"
            name="type"
            required
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="PHYSICAL">Física</option>
            <option value="FINANCIAL">Financeira</option>
            <option value="MIXED">Mista</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ec-appraisal">Valor de avaliação do terreno (R$)</label>
          <input
            id="ec-appraisal"
            name="appraisalValue"
            type="number"
            step="0.01"
            min="0"
            defaultValue={contract?.appraisalValue ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="ec-date">Data do contrato *</label>
          <input
            id="ec-date"
            name="contractDate"
            type="date"
            required
            defaultValue={contract ? new Date(contract.contractDate).toISOString().slice(0, 10) : ""}
          />
        </div>
        <div className="field">
          <label htmlFor="ec-status">Status</label>
          <select id="ec-status" name="status" defaultValue={contract?.status ?? "ACTIVE"}>
            <option value="ACTIVE">Ativo</option>
            <option value="SETTLED">Quitado</option>
            <option value="TERMINATED">Encerrado</option>
          </select>
        </div>
        {type !== "FINANCIAL" ? (
          <>
            <div className="field">
              <label htmlFor="ec-managed">Gestão de vendas pelo sistema?</label>
              <select
                id="ec-managed"
                name="managedBySystem"
                value={String(managedBySystem)}
                onChange={(e) => setManagedBySystem(e.target.value === "true")}
              >
                <option value="true">Sim — incorporadora gerencia a venda</option>
                <option value="false">Não — permutante vende por fora</option>
              </select>
            </div>
            {managedBySystem ? (
              <div className="field">
                <label htmlFor="ec-fee">Taxa de administração (%)</label>
                <input
                  id="ec-fee"
                  name="administrationFeePct"
                  type="number"
                  step="0.001"
                  min="0"
                  max="100"
                  defaultValue={contract?.administrationFeePct ?? ""}
                />
              </div>
            ) : null}
          </>
        ) : null}
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="ec-notes">Observações</label>
          <input id="ec-notes" name="notes" defaultValue={contract?.notes ?? ""} />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Terreno(s) objeto da permuta</label>
          {lands.length === 0 ? (
            <p className="field-hint">Nenhum terreno cadastrado na SPE deste empreendimento.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {lands.map((land) => (
                <label key={land.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    name="landIds"
                    value={land.id}
                    defaultChecked={contract?.landIds.includes(land.id) ?? false}
                  />
                  {land.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {state.error ? <p className="error-text">{state.error}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar contrato"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function DocumentUpload({ developmentId, contractId }: { developmentId: string; contractId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleUpload() {
    setError(null);
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Selecione um arquivo.");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    setBusy(true);
    const result = await uploadExchangeContractDocumentAction(developmentId, contractId, formData);
    setBusy(false);
    if (result.error) setError(result.error);
    else if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <input ref={fileInputRef} type="file" style={{ fontSize: "0.8rem" }} />
      <button type="button" className="secondary" disabled={busy} onClick={handleUpload}>
        {busy ? "Enviando..." : "Enviar"}
      </button>
      {error ? <span className="error-text">{error}</span> : null}
    </div>
  );
}

export function ExchangeContractsManager({
  developmentId,
  contracts,
  permutantes,
  lands,
  canCreate,
  canEdit,
  canDelete,
}: {
  developmentId: string;
  contracts: ExchangeContractRow[];
  permutantes: Option[];
  lands: Option[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState<ExchangeContractRow | null | "new">(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(contract: ExchangeContractRow) {
    if (!confirm(`Excluir o contrato de permuta com ${contract.permutanteName}?`)) return;
    setError(null);
    const result = await deleteExchangeContractAction(developmentId, contract.id);
    if (result.error) setError(result.error);
  }

  return (
    <div>
      {error ? <p className="error-text">{error}</p> : null}

      {contracts.length === 0 ? (
        <p className="field-hint">Nenhum contrato de permuta cadastrado.</p>
      ) : (
        contracts.map((contract) => (
          <div key={contract.id} className="field-section" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <strong>{contract.permutanteName}</strong>
                <p style={{ fontSize: "0.85rem", opacity: 0.8, marginTop: "0.25rem" }}>
                  {TYPE_LABELS[contract.type] ?? contract.type} · {STATUS_LABELS[contract.status] ?? contract.status} ·{" "}
                  {formatCalendarDateBR(contract.contractDate)}
                  {contract.appraisalValue !== null ? ` · avaliação ${formatCurrency(contract.appraisalValue)}` : ""}
                </p>
                {contract.type !== "FINANCIAL" ? (
                  <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                    {contract.managedBySystem
                      ? `Sob gestão do sistema${contract.administrationFeePct !== null ? ` · taxa de administração ${contract.administrationFeePct}%` : ""}`
                      : "Fora de gestão — permutante vende por fora"}
                  </p>
                ) : null}
                <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                  Terreno(s): {contract.landLabels.join(", ") || "—"}
                </p>
                <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                  {contract.unitCount} unidade(s) destacada(s)
                  {contract.unitCount > 0 ? `: ${contract.unitNumbers.join(", ")}` : ""}
                </p>
                {contract.notes ? <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>{contract.notes}</p> : null}
              </div>
              {canEdit ? (
                <div className="row-actions">
                  <button type="button" className="secondary" onClick={() => setEditing(contract)}>
                    Editar
                  </button>
                  {canDelete ? (
                    <button type="button" className="secondary" onClick={() => handleDelete(contract)}>
                      Excluir
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {canEdit ? (
              <div style={{ marginTop: "0.75rem" }}>
                <DocumentUpload developmentId={developmentId} contractId={contract.id} />
              </div>
            ) : null}

            {editing !== "new" && editing?.id === contract.id ? (
              <ExchangeContractForm
                developmentId={developmentId}
                contract={contract}
                permutantes={permutantes}
                lands={lands}
                onSaved={() => setEditing(null)}
                onCancel={() => setEditing(null)}
              />
            ) : null}
          </div>
        ))
      )}

      {editing === "new" ? (
        <ExchangeContractForm
          developmentId={developmentId}
          contract={null}
          permutantes={permutantes}
          lands={lands}
          onSaved={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      ) : canCreate ? (
        <button type="button" onClick={() => setEditing("new")}>
          + Novo contrato de permuta
        </button>
      ) : null}
    </div>
  );
}
