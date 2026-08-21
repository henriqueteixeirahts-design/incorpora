"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  hasSubmenu?: boolean;
};

type NavGroup = {
  label: string | null; // null = sem rótulo de grupo (fica solto no topo, ex.: Dashboard)
  items: NavItem[];
};

/**
 * Agrupamento por natureza (docs/ESPEC_NAVEGACAO_PERFIS_RBAC.md, Parte 1.2):
 * Operação diária (uso do dia a dia) primeiro, depois Cadastros (base do
 * sistema), Financeiro, Gerencial, Configurações. As telas por empreendimento
 * (espelho, comercial, tabelas de venda, permuta, e as 6 regras de
 * configuração) continuam dentro do submenu de "Empreendimentos" — não têm
 * rota própria fora de um empreendimento selecionado, então mover cada uma
 * pra um item de topo exigiria criar uma tela nova, fora do escopo desta
 * etapa (decisão registrada: Unidades e as regras seguem como atalho via
 * empreendimento, não como tela nova).
 */
const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/dashboard", label: "Dashboard", icon: "ic-dashboard" }],
  },
  {
    label: "Operação diária",
    items: [
      { href: "/sales", label: "Vendas", icon: "ic-venda" },
      { href: "/commissions", label: "Comissões", icon: "ic-comissao" },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { href: "/developments", label: "Empreendimentos", icon: "ic-empreendimento", hasSubmenu: true },
      { href: "/customers", label: "Clientes", icon: "ic-cliente" },
      { href: "/partners", label: "Imobiliárias/Corretores", icon: "ic-corretor" },
      { href: "/permutantes", label: "Permutantes", icon: "ic-permuta" },
      { href: "/spes", label: "SPEs", icon: "ic-spe" },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { href: "/receivables/overdue", label: "Inadimplência", icon: "ic-inadimplencia" },
      { href: "/payables", label: "Contas a pagar", icon: "ic-pagar" },
      { href: "/receivables/avulsos", label: "Recebíveis avulsos", icon: "ic-receber" },
      { href: "/receivables/consolidated", label: "Contas a receber consolidado", icon: "ic-receber" },
      { href: "/cash-flow", label: "Fluxo de caixa", icon: "ic-fluxo" },
    ],
  },
  {
    label: "Gerencial",
    items: [
      { href: "/reports", label: "Relatórios", icon: "ic-relatorio" },
      { href: "/settings/rules/proposal-evaluation", label: "Parâmetros de avaliação", icon: "ic-viabilidade" },
    ],
  },
  {
    label: "Configurações",
    items: [{ href: "/settings", label: "Configurações", icon: "ic-config" }],
  },
];

/**
 * "daily" = uso do dia a dia do empreendimento; "config" = regras
 * parametrizáveis (Parte 1.3 — geral × empreendimento, ver etapa 1b). Só
 * separa visualmente dentro do submenu por enquanto — cada uma dessas 6
 * regras ainda só existe por empreendimento (sem rota "geral" própria fora
 * daqui até a etapa 1b entrar).
 */
const DEVELOPMENT_SUBITEMS: { label: string; suffix: string; group: "daily" | "config" }[] = [
  { label: "Espelho de vendas", suffix: "/map", group: "daily" },
  { label: "Comercial", suffix: "/commercial", group: "daily" },
  { label: "Tabelas de venda", suffix: "/sales-tables", group: "daily" },
  { label: "Permuta", suffix: "/exchange-contracts", group: "daily" },
  { label: "Regras de reserva", suffix: "/reservation-rules", group: "config" },
  { label: "Parâmetros de avaliação", suffix: "/proposal-evaluation-rules", group: "config" },
  { label: "Liberação de comissão", suffix: "/commission-release-rule", group: "config" },
  { label: "Regra de distrato", suffix: "/distrato-rule", group: "config" },
  { label: "Régua de cobrança", suffix: "/collection-rule", group: "config" },
  { label: "Renegociação de parcelas", suffix: "/renegotiation-rule", group: "config" },
];

function Icon({ id, size = 17 }: { id: string; size?: number }) {
  return (
    <svg style={{ width: size, height: size }}>
      <use href={`/icons.svg#${id}`} />
    </svg>
  );
}

export function Sidebar({
  userName,
  userRole,
  signOutAction,
}: {
  userName: string;
  userRole: string;
  signOutAction: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const developmentMatch = pathname.match(/^\/developments\/([^/]+)(\/.*)?$/);
  const developmentId = developmentMatch ? developmentMatch[1] : null;

  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <nav className="inc-nav">
      <div className="inc-nav__brand">
        <svg viewBox="0 0 1920.94 445.27">
          <use href="/icons.svg#tsh-logo" />
        </svg>
        <div className="inc-nav__brand-tag">Incorpora</div>
      </div>

      <div className="inc-nav__list">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label ?? `group-${groupIndex}`} className="inc-nav__group">
            {group.label ? <div className="inc-nav__group-label">{group.label}</div> : null}
            {group.items.map((item) => {
              const isSubmenuOpen = item.hasSubmenu && developmentId !== null;
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <div key={item.href}>
                  <Link
                    href={item.href}
                    className={`inc-nav__item${isSubmenuOpen ? " inc-nav__item--open" : ""}`}
                    aria-current={!item.hasSubmenu && isActive ? "page" : undefined}
                  >
                    <Icon id={item.icon} />
                    {item.label}
                    {item.hasSubmenu ? <span className="inc-nav__chevron"><Icon id="ic-chevron" size={13} /></span> : null}
                  </Link>
                  {item.hasSubmenu && isSubmenuOpen ? (
                    <div className="inc-nav__sub">
                      <Link
                        href="/developments"
                        className="inc-nav__subitem"
                        aria-current={pathname === "/developments" ? "page" : undefined}
                      >
                        Lista de empreendimentos
                      </Link>
                      {DEVELOPMENT_SUBITEMS.map((sub, subIndex) => {
                        const href = `/developments/${developmentId}${sub.suffix}`;
                        const isFirstConfigItem = sub.group === "config" && DEVELOPMENT_SUBITEMS[subIndex - 1]?.group !== "config";
                        return (
                          <div key={sub.suffix}>
                            {isFirstConfigItem ? (
                              <div className="inc-nav__group-label" style={{ margin: "8px 10px 3px" }}>
                                Configurações
                              </div>
                            ) : null}
                            <Link
                              href={href}
                              className="inc-nav__subitem"
                              aria-current={pathname === href || pathname.startsWith(href + "/") ? "page" : undefined}
                            >
                              {sub.label}
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="inc-nav__user">
        <div className="inc-nav__avatar">{initials || "?"}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="inc-nav__user-name">{userName}</div>
          <div className="inc-nav__user-role">{userRole}</div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            aria-label="Sair"
            style={{ all: "unset", cursor: "pointer", display: "flex" }}
          >
            <Icon id="ic-sair" size={16} />
          </button>
        </form>
      </div>
    </nav>
  );
}
