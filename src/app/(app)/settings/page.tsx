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
      title: "Regras parametrizáveis",
      items: [
        {
          href: "/settings/rules/reservation",
          label: "Regras de reserva",
          visible: hasPermission(context, "development", "VIEW"),
        },
        {
          href: "/settings/rules/proposal-evaluation",
          label: "Parâmetros de avaliação",
          visible: hasPermission(context, "development", "VIEW"),
        },
        {
          href: "/settings/rules/commission-release",
          label: "Liberação de comissão",
          visible: hasPermission(context, "development", "VIEW"),
        },
        {
          href: "/settings/rules/distrato",
          label: "Regra de distrato",
          visible: hasPermission(context, "development", "VIEW"),
        },
        {
          href: "/settings/rules/collection",
          label: "Régua de cobrança",
          visible: hasPermission(context, "development", "VIEW"),
        },
        {
          href: "/settings/rules/renegotiation",
          label: "Renegociação de parcelas",
          visible: hasPermission(context, "development", "VIEW"),
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
        {
          href: "/settings/roles",
          label: "Perfis de acesso",
          visible: hasPermission(context, "role", "VIEW"),
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
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Configurações</div>
          <h1 className="inc-h1">Configurações do sistema</h1>
        </div>
      </div>
      <p className="inc-lede">
        Itens de configuração do sistema, separados do uso operacional do dia a dia.
      </p>

      {sections.map((section) => {
        const visibleItems = section.items.filter((item) => item.visible);
        if (visibleItems.length === 0) return null;

        return (
          <div key={section.title} className="inc-card">
            <div className="inc-card__head">
              <div className="inc-card__title">{section.title}</div>
            </div>
            <div className="inc-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--inc-space-4)" }}>
              {visibleItems.map((item) => (
                <Link key={item.href} href={item.href}>
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
