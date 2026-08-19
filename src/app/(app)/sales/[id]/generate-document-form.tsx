"use client";

import { useActionState, useState } from "react";
import { generateDocumentAction, type GenerateDocumentState } from "./actions";
import { isDraftTemplateName } from "@/lib/document-template-draft";

const initialState: GenerateDocumentState = {};

type Option = { id: string; label: string };

export function GenerateDocumentForm({
  saleId,
  contractId,
  amendmentId,
  assignmentId,
  distratoId,
  templates,
}: {
  saleId: string;
  contractId: string;
  amendmentId?: string;
  assignmentId?: string;
  distratoId?: string;
  templates: Option[];
}) {
  const [state, formAction, pending] = useActionState(generateDocumentAction, initialState);
  const [selectedId, setSelectedId] = useState("");

  if (templates.length === 0) {
    return <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>Nenhum modelo ativo pra este empreendimento.</p>;
  }

  const selected = templates.find((t) => t.id === selectedId);
  const selectedIsDraft = selected ? isDraftTemplateName(selected.label) : false;

  return (
    <form action={formAction} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="contractId" value={contractId} />
      {amendmentId ? <input type="hidden" name="amendmentId" value={amendmentId} /> : null}
      {assignmentId ? <input type="hidden" name="assignmentId" value={assignmentId} /> : null}
      {distratoId ? <input type="hidden" name="distratoId" value={distratoId} /> : null}

      <select name="documentTemplateId" required defaultValue="" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
        <option value="" disabled>
          Selecione o modelo...
        </option>
        {templates.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <button type="submit" disabled={pending}>
        {pending ? "Gerando..." : "Gerar documento"}
      </button>

      {selectedIsDraft ? (
        <p className="error-text" style={{ width: "100%" }}>
          ⚠ Este modelo é um rascunho gerado automaticamente — revise com o jurídico antes de usar o documento gerado como definitivo.
        </p>
      ) : null}

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.missing && state.missing.length > 0 ? (
        <p className="error-text" style={{ width: "100%" }}>
          Faltam dados no cadastro pra gerar &quot;{state.missingTemplateName}&quot;: {state.missing.join(", ")}
        </p>
      ) : null}
    </form>
  );
}
