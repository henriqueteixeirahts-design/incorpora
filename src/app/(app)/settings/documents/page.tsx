import { requireAccessContext, hasPermission } from "@/server/auth-context";
import { listDocumentTemplates, listDocumentTemplateVersions } from "@/server/document-templates";
import { listDevelopments } from "@/server/developments";
import {
  NewDocumentTemplateForm,
  EditDocumentTemplateForm,
  ToggleDocumentTemplateStatusButton,
} from "./document-template-form";
import { formatDateTimeBR } from "@/lib/format";
import { isDraftTemplateName } from "@/lib/document-template-draft";
import { seedDefaultDocumentTemplatesAction } from "./actions";

const TYPE_LABELS: Record<string, string> = {
  SALES_CONTRACT: "Contrato de compra e venda / promessa",
  ASSIGNMENT: "Cessão de direitos",
  RESCISSION: "Distrato",
  AMENDMENT: "Aditivo contratual",
  STATEMENT: "Extrato/Demonstrativo",
  OTHER: "Procuração / declaração / outros",
};

export default async function DocumentTemplatesPage() {
  const context = await requireAccessContext();
  const [templates, developments] = await Promise.all([
    listDocumentTemplates(context.organizationId),
    listDevelopments(context),
  ]);

  const canCreate = hasPermission(context, "document_template", "CREATE");
  const canEdit = hasPermission(context, "document_template", "EDIT");
  const developmentOptions = developments.map((d) => ({ id: d.id, label: d.name }));

  const versionHistories = await Promise.all(
    templates.map((t) => listDocumentTemplateVersions(context.organizationId, t.templateGroupId)),
  );

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Configurações</div>
          <h1 className="inc-h1">Modelos de documento</h1>
          <p className="inc-lede">
            Biblioteca de modelos com variáveis — o sistema preenche automaticamente com os dados da
            venda/contrato na hora de gerar. Editar um modelo cria uma nova versão; versões antigas nunca
            são apagadas e o documento gerado sempre referencia a versão exata usada.
          </p>
        </div>
      </div>

      {canCreate ? (
        <form action={seedDefaultDocumentTemplatesAction} style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button type="submit" className="inc-btn inc-btn--secondary">
            Criar modelos padrão que faltam
          </button>
          <span style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
            Cria um modelo por tipo (contrato, cessão, distrato, extrato) que ainda não existir — não duplica os já cadastrados.
          </span>
        </form>
      ) : null}

      {templates.map((template, index) => (
        <div
          key={template.templateGroupId}
          className="inc-card"
          style={{ marginTop: "16px", maxWidth: 760 }}
        >
          <div className="inc-card__head">
            <span className="inc-card__title">{template.name}</span>
            <span className="inc-card__meta">
              {TYPE_LABELS[template.type] ?? template.type} · v{template.version}
            </span>
            <span className={`inc-pill ${template.status === "ACTIVE" ? "inc-pill--ok" : ""}`}>
              {template.status === "ACTIVE" ? <span className="inc-pill__dot" /> : null}
              {template.status === "ACTIVE" ? "Ativo" : "Inativo"}
            </span>
          </div>
          <div className="inc-card__body">
            <p style={{ margin: 0, fontSize: "12.5px", color: "var(--inc-text-muted)" }}>
              {template.versionCount} versão(ões)
            </p>
            {isDraftTemplateName(template.name) ? (
              <p
                style={{
                  marginTop: "10px",
                  marginBottom: 0,
                  padding: "8px 11px",
                  background: "var(--inc-warning-bg)",
                  border: "1px solid var(--inc-warning-border)",
                  borderRadius: "var(--inc-radius-2)",
                  fontSize: "12.5px",
                  fontWeight: "var(--inc-fw-medium)",
                  color: "var(--inc-warning-text)",
                }}
              >
                ⚠ Rascunho gerado automaticamente — revisar com jurídico antes de usar em um documento real.
              </p>
            ) : null}
            <p style={{ fontSize: "12.5px", color: "var(--inc-text-secondary)", marginTop: "10px", marginBottom: 0 }}>
              Aplica-se a:{" "}
              {template.developments.length === 0
                ? "todos os empreendimentos"
                : template.developments.map((d) => d.development.name).join(", ")}
            </p>

            {versionHistories[index].length > 1 ? (
              <details style={{ marginTop: "10px" }}>
                <summary style={{ fontSize: "12.5px", cursor: "pointer", color: "var(--inc-brand-azul)" }}>
                  Histórico de versões
                </summary>
                <ul style={{ paddingLeft: "18px", marginTop: "6px", fontSize: "12.5px", color: "var(--inc-text-secondary)" }}>
                  {versionHistories[index].map((v) => (
                    <li key={v.id}>
                      v{v.version} — {formatDateTimeBR(v.createdAt)}
                      {v.id === template.id ? " (atual)" : ""}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {canEdit ? (
              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <ToggleDocumentTemplateStatusButton templateGroupId={template.templateGroupId} status={template.status} />
              </div>
            ) : null}

            {canEdit ? (
              <div style={{ marginTop: "8px" }}>
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
        </div>
      ))}
      {templates.length === 0 ? (
        <p style={{ color: "var(--inc-text-soft)", marginTop: "16px" }}>Nenhum modelo cadastrado.</p>
      ) : null}

      {canCreate ? <NewDocumentTemplateForm developments={developmentOptions} /> : null}
    </>
  );
}
