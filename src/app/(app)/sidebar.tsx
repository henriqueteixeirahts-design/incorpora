"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  hasSubmenu?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "ic-dashboard" },
  { href: "/spes", label: "SPEs", icon: "ic-spe" },
  { href: "/developments", label: "Empreendimentos", icon: "ic-empreendimento", hasSubmenu: true },
  { href: "/customers", label: "Clientes", icon: "ic-cliente" },
  { href: "/partners", label: "Imobiliárias/Corretores", icon: "ic-corretor" },
  { href: "/permutantes", label: "Permutantes", icon: "ic-permuta" },
  { href: "/sales", label: "Vendas", icon: "ic-venda" },
  { href: "/commissions", label: "Comissões", icon: "ic-comissao" },
  { href: "/reports", label: "Relatórios", icon: "ic-relatorio" },
  { href: "/receivables/overdue", label: "Inadimplência", icon: "ic-inadimplencia" },
  { href: "/payables", label: "Contas a pagar", icon: "ic-pagar" },
  { href: "/receivables/avulsos", label: "Recebíveis avulsos", icon: "ic-receber" },
  { href: "/cash-flow", label: "Fluxo de caixa", icon: "ic-fluxo" },
  { href: "/settings", label: "Configurações", icon: "ic-config" },
];

const DEVELOPMENT_SUBITEMS: { label: string; suffix: string }[] = [
  { label: "Espelho de vendas", suffix: "/map" },
  { label: "Tabelas de venda", suffix: "/sales-tables" },
  { label: "Comercial", suffix: "/commercial" },
  { label: "Permuta", suffix: "/exchange-contracts" },
  { label: "Regras de reserva", suffix: "/reservation-rules" },
  { label: "Avaliação de propostas", suffix: "/proposal-evaluation-rules" },
  { label: "Liberação de comissão", suffix: "/commission-release-rule" },
  { label: "Regra de distrato", suffix: "/distrato-rule" },
  { label: "Régua de cobrança", suffix: "/collection-rule" },
  { label: "Renegociação de parcelas", suffix: "/renegotiation-rule" },
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
        {NAV_ITEMS.map((item) => {
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
                  {DEVELOPMENT_SUBITEMS.map((sub) => {
                    const href = `/developments/${developmentId}${sub.suffix}`;
                    return (
                      <Link
                        key={sub.suffix}
                        href={href}
                        className="inc-nav__subitem"
                        aria-current={pathname === href || pathname.startsWith(href + "/") ? "page" : undefined}
                      >
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
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
