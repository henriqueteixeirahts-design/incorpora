import Link from "next/link";
import { requireAccessContext, hasPermission } from "@/server/auth-context";

export default async function SettingsPage() {
  const context = await requireAccessContext();

  const sections = [
    {
      title: "Financeiro",
      items: [
        {
          href: "/settings/finance-setup",
          label: "Fornecedores, centros de custo e contas bancárias",
          visible:
            hasPermission(context, "supplier", "VIEW") ||
            hasPermission(context, "cost_center", "VIEW") ||
            hasPermission(context, "bank_account", "VIEW"),
        },
        {
          href: "/settings/index-rules",
          label: "Índices de correção",
          visible: hasPermission(context, "index_rule", "VIEW"),
        },
      ],
    },
    {
      title: "Documentos",
      items: [
        {
          href: "/settings/documents",
          label: "Modelos de documento",
          visible: hasPermission(context, "document_template", "VIEW"),
        },
      ],
    },
    {
      title: "Acesso ao sistema",
      items: [
        {
          href: "/settings/users",
          label: "Usuários",
          visible: hasPermission(context, "user", "VIEW"),
        },
      ],
    },
    {
      title: "Sistema",
      items: [
        {
          href: "/settings/jobs",
          label: "Jobs — histórico e execução manual",
          visible: hasPermission(context, "job", "VIEW"),
        },
        {
          href: "/settings/audit",
          label: "Auditoria de atualização — verificações V1-V5",
          visible: hasPermission(context, "audit", "VIEW"),
        },
      ],
    },
  ];

  return (
    <>
      <h1>Configurações</h1>
      <p style={{ opacity: 0.7, maxWidth: 600, marginTop: "0.5rem" }}>
        Itens de configuração do sistema, separados do uso operacional do dia a dia.
      </p>

      {sections.map((section) => {
        const visibleItems = section.items.filter((item) => item.visible);
        if (visibleItems.length === 0) return null;

        return (
          <div key={section.title} className="field-section" style={{ marginTop: "2rem" }}>
            <h3>{section.title}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {visibleItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    padding: "0.75rem 1rem",
                    border: "1px solid var(--border-color)",
                    borderRadius: 8,
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
