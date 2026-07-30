import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listDocumentTemplates, listDocumentTemplateVersions } from "@/server/document-templates";
import { listDevelopments } from "@/server/developments";
import {
  NewDocumentTemplateForm,
  EditDocumentTemplateForm,
  ToggleDocumentTemplateStatusButton,
} from "./document-template-form";

const TYPE_LABELS: Record<string, string> = {
  SALES_CONTRACT: "Contrato de compra e venda / promessa",
  ASSIGNMENT: "Cessão de direitos",
  RESCISSION: "Distrato",
  AMENDMENT: "Aditivo contratual",
  OTHER: "Procuração / declaração / outros",
};

export default async function DocumentTemplatesPage() {
  const context = await requireAccessContext();
  const [templates, developments] = await Promise.all([
    listDocumentTemplates(context.organizationId),
    listDevelopments(context.organizationId),
  ]);

  const canCreate = hasPermission(context, "document_template", "CREATE");
  const canEdit = hasPermission(context, "document_template", "EDIT");
  const developmentOptions = developments.map((d) => ({ id: d.id, label: d.name }));

  const versionHistories = await Promise.all(
    templates.map((t) => listDocumentTemplateVersions(context.organizationId, t.templateGroupId)),
  );

  return (
    <>
      <h1>Modelos de documento</h1>
      <p style={{ opacity: 0.7, maxWidth: 700 }}>
        Biblioteca de modelos com variáveis — o sistema preenche automaticamente com os dados da
        venda/contrato na hora de gerar. Editar um modelo cria uma nova versão; versões antigas nunca
        são apagadas e o documento gerado sempre referencia a versão exata usada.
      </p>

      {templates.map((template, index) => (
        <div
          key={template.templateGroupId}
          className="field-section"
          style={{ marginTop: "1.5rem", maxWidth: 700 }}
        >
          <p>
            <strong>{template.name}</strong> — {TYPE_LABELS[template.type] ?? template.type}
            <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", opacity: 0.7 }}>
              v{template.version} · {template.status === "ACTIVE" ? "Ativo" : "Inativo"} ·{" "}
              {template.versionCount} versão(ões)
            </span>
          </p>
          <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
            Aplica-se a:{" "}
            {template.developments.length === 0
              ? "todos os empreendimentos"
              : template.developments.map((d) => d.development.name).join(", ")}
          </p>

          {versionHistories[index].length > 1 ? (
            <details style={{ marginTop: "0.5rem" }}>
              <summary style={{ fontSize: "0.85rem", cursor: "pointer" }}>Histórico de versões</summary>
              <ul style={{ paddingLeft: "1.1rem", marginTop: "0.4rem", fontSize: "0.8rem" }}>
                {versionHistories[index].map((v) => (
                  <li key={v.id}>
                    v{v.version} — {new Date(v.createdAt).toLocaleString("pt-BR")}
                    {v.id === template.id ? " (atual)" : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {canEdit ? (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <ToggleDocumentTemplateStatusButton templateGroupId={template.templateGroupId} status={template.status} />
            </div>
          ) : null}

          {canEdit ? (
            <div style={{ marginTop: "0.5rem" }}>
              <EditDocumentTemplateForm
                templateGroupId={template.templateGroupId}
                type={template.type}
                currentName={template.name}
                currentContent={template.content}
                currentDevelopmentIds={template.developments.map((d) => d.developmentId)}
                developments={developmentOptions}
              />
            </div>
          ) : null}
        </div>
      ))}
      {templates.length === 0 ? <p style={{ opacity: 0.7, marginTop: "1rem" }}>Nenhum modelo cadastrado.</p> : null}

      {canCreate ? <NewDocumentTemplateForm developments={developmentOptions} /> : null}
    </>
  );
}
