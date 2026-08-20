"use client";

import { useActionState, useState } from "react";
import { DOCUMENT_VARIABLE_CATALOG } from "@/lib/document-variables";
import {
  createDocumentTemplateAction,
  updateDocumentTemplateAction,
  toggleDocumentTemplateStatusAction,
  type FormState,
} from "./actions";

const TYPE_LABELS: Record<string, string> = {
  SALES_CONTRACT: "Contrato de compra e venda / promessa",
  ASSIGNMENT: "Cessão de direitos",
  RESCISSION: "Distrato",
  AMENDMENT: "Aditivo contratual",
  STATEMENT: "Extrato/Demonstrativo",
  OTHER: "Procuração / declaração / outros",
};

const initialState: FormState = {};

type Option = { id: string; label: string };

function VariableCatalog() {
  return (
    <div style={{ fontSize: "12px", maxWidth: 280, color: "var(--inc-text-secondary)" }}>
      <p style={{ color: "var(--inc-text-soft)", marginBottom: "8px" }}>
        Use <code>{"{{variavel}}"}</code> no texto. Blocos ({"{{fluxo.parcelas_tabela}}"},{" "}
        {"{{quadro_resumo}}"}) devem ficar sozinhos em um parágrafo — viram uma tabela/bloco formatado.
      </p>
      {DOCUMENT_VARIABLE_CATALOG.map((group) => (
        <div key={group.group} style={{ marginBottom: "12px" }}>
          <strong style={{ color: "var(--inc-brand-azul)" }}>{group.group}</strong>
          <ul style={{ paddingLeft: "18px", marginTop: "4px" }}>
            {group.tokens.map((token) => (
              <li key={token.key}>
                <code>{`{{${token.key}}}`}</code> — {token.label}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function NewDocumentTemplateForm({ developments }: { developments: Option[] }) {
  const [state, formAction, pending] = useActionState(createDocumentTemplateAction, initialState);

  return (
    <div className="inc-card" style={{ marginTop: "24px" }}>
      <div className="inc-card__head">
        <span className="inc-card__title">Novo modelo</span>
      </div>
      <div className="inc-card__body" style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
        <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: 480, flex: 1 }}>
          <label className="inc-field">
            <span className="inc-label">Nome</span>
            <input id="new-doc-name" name="name" className="inc-input" required />
          </label>

          <label className="inc-field">
            <span className="inc-label">Tipo</span>
            <select id="new-doc-type" name="type" className="inc-select" required defaultValue="">
              <option value="" disabled>
                Selecione...
              </option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div className="inc-field">
            <span className="inc-label">Empreendimentos aplicáveis (nenhum selecionado = todos)</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: 140, overflowY: "auto" }}>
              {developments.map((dev) => (
                <label key={dev.id} style={{ fontWeight: 400, fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <input type="checkbox" name="developmentIds" value={dev.id} /> {dev.label}
                </label>
              ))}
            </div>
          </div>

          <label className="inc-field">
            <span className="inc-label">Conteúdo</span>
            <textarea id="new-doc-content" name="content" className="inc-input" rows={12} required style={{ height: "auto", padding: "8px 11px" }} />
          </label>

          {state.error ? <p className="error-text">{state.error}</p> : null}

          <button type="submit" className="inc-btn inc-btn--primary" disabled={pending} style={{ alignSelf: "flex-start" }}>
            {pending ? "Salvando..." : "Criar modelo"}
          </button>
        </form>

        <VariableCatalog />
      </div>
    </div>
  );
}

export function EditDocumentTemplateForm({
  templateGroupId,
  type,
  currentName,
  currentContent,
  currentDevelopmentIds,
  developments,
}: {
  templateGroupId: string;
  type: string;
  currentName: string;
  currentContent: string;
  currentDevelopmentIds: string[];
  developments: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateDocumentTemplateAction, initialState);

  if (!open) {
    return (
      <button type="button" className="inc-btn inc-btn--secondary inc-btn--sm" onClick={() => setOpen(true)}>
        Editar (cria nova versão)
      </button>
    );
  }

  return (
    <div style={{ marginTop: "12px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: 480, flex: 1 }}>
        <input type="hidden" name="templateGroupId" value={templateGroupId} />
        <input type="hidden" name="type" value={type} />

        <label className="inc-field">
          <span className="inc-label">Nome</span>
          <input id={`edit-doc-name-${templateGroupId}`} name="name" className="inc-input" defaultValue={currentName} required />
        </label>

        <div className="inc-field">
          <span className="inc-label">Empreendimentos aplicáveis (nenhum selecionado = todos)</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: 140, overflowY: "auto" }}>
            {developments.map((dev) => (
              <label key={dev.id} style={{ fontWeight: 400, fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                <input
                  type="checkbox"
                  name="developmentIds"
                  value={dev.id}
                  defaultChecked={currentDevelopmentIds.includes(dev.id)}
                />{" "}
                {dev.label}
              </label>
            ))}
          </div>
        </div>

        <label className="inc-field">
          <span className="inc-label">Conteúdo</span>
          <textarea
            id={`edit-doc-content-${templateGroupId}`}
            name="content"
            className="inc-input"
            rows={12}
            defaultValue={currentContent}
            required
            style={{ height: "auto", padding: "8px 11px" }}
          />
        </label>

        {state.error ? <p className="error-text">{state.error}</p> : null}
        {state.ok ? (
          <p className="inc-help" style={{ margin: 0 }}>Nova versão salva.</p>
        ) : null}

        <div style={{ display: "flex", gap: "8px" }}>
          <button type="submit" className="inc-btn inc-btn--primary" disabled={pending}>
            {pending ? "Salvando..." : "Salvar como nova versão"}
          </button>
          <button type="button" className="inc-btn inc-btn--secondary" onClick={() => setOpen(false)}>
            Fechar
          </button>
        </div>
      </form>

      <VariableCatalog />
    </div>
  );
}

export function ToggleDocumentTemplateStatusButton({
  templateGroupId,
  status,
}: {
  templateGroupId: string;
  status: "ACTIVE" | "INACTIVE";
}) {
  const nextStatus = status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  return (
    <form action={toggleDocumentTemplateStatusAction}>
      <input type="hidden" name="templateGroupId" value={templateGroupId} />
      <input type="hidden" name="status" value={nextStatus} />
      <button type="submit" className="inc-btn inc-btn--secondary inc-btn--sm">
        {status === "ACTIVE" ? "Inativar" : "Ativar"}
      </button>
    </form>
  );
}
