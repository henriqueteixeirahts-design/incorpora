"use client";

import { useActionState } from "react";
import { generateDocumentAction, type GenerateDocumentState } from "./actions";

const initialState: GenerateDocumentState = {};

type Option = { id: string; label: string };

export function GenerateDocumentForm({
  saleId,
  contractId,
  amendmentId,
  assignmentId,
  templates,
}: {
  saleId: string;
  contractId: string;
  amendmentId?: string;
  assignmentId?: string;
  templates: Option[];
}) {
  const [state, formAction, pending] = useActionState(generateDocumentAction, initialState);

  if (templates.length === 0) {
    return <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>Nenhum modelo ativo pra este empreendimento.</p>;
  }

  return (
    <form action={formAction} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
      <input type="hidden" name="saleId" value={saleId} />
      <input type="hidden" name="contractId" value={contractId} />
      {amendmentId ? <input type="hidden" name="amendmentId" value={amendmentId} /> : null}
      {assignmentId ? <input type="hidden" name="assignmentId" value={assignmentId} /> : null}

      <select name="documentTemplateId" required defaultValue="">
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

      {state.error ? <p className="error-text">{state.error}</p> : null}
      {state.missing && state.missing.length > 0 ? (
        <p className="error-text" style={{ width: "100%" }}>
          Faltam dados no cadastro pra gerar &quot;{state.missingTemplateName}&quot;: {state.missing.join(", ")}
        </p>
      ) : null}
    </form>
  );
}
