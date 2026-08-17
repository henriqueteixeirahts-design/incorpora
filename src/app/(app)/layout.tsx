import Link from "next/link";
import { requireAccessContext } from "@/server/auth-context";
import { signOutAction } from "@/app/login/actions";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await requireAccessContext();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 232,
          padding: "1.5rem 1rem",
          background: "var(--tsh-blue)",
          display: "flex",
          flexDirection: "column",
          gap: "0.4rem",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/tsh-logo-white.svg"
          alt="TSH"
          style={{ height: 24, width: "auto", marginBottom: "1.5rem" }}
        />
        <Link href="/dashboard" className="app-nav-link">
          Dashboard
        </Link>
        <Link href="/spes" className="app-nav-link">
          SPEs
        </Link>
        <Link href="/developments" className="app-nav-link">
          Empreendimentos
        </Link>
        <Link href="/customers" className="app-nav-link">
          Clientes
        </Link>
        <Link href="/partners" className="app-nav-link">
          Imobiliárias/Corretores
        </Link>
        <Link href="/permutantes" className="app-nav-link">
          Permutantes
        </Link>
        <Link href="/sales" className="app-nav-link">
          Vendas
        </Link>
        <Link href="/commissions" className="app-nav-link">
          Comissões
        </Link>
        <Link href="/reports" className="app-nav-link">
          Relatórios
        </Link>
        <Link href="/receivables/overdue" className="app-nav-link">
          Inadimplência
        </Link>
        <Link href="/payables" className="app-nav-link">
          Contas a pagar
        </Link>
        <Link href="/receivables/avulsos" className="app-nav-link">
          Recebíveis avulsos
        </Link>
        <Link href="/cash-flow" className="app-nav-link">
          Fluxo de caixa
        </Link>
        <Link href="/settings" className="app-nav-link">
          Configurações
        </Link>

        <form action={signOutAction} style={{ marginTop: "auto" }}>
          <button
            type="submit"
            className="secondary"
            style={{ borderColor: "#8abddd", color: "#fff2e0", width: "100%" }}
          >
            Sair
          </button>
        </form>
      </aside>

      <div style={{ flex: 1, padding: "1.5rem 2rem" }}>
        <p style={{ fontSize: "0.8rem", opacity: 0.7, marginBottom: "1rem" }}>
          {context.roleNames.join(", ") || "Sem papel atribuído"}
        </p>
        {children}
      </div>
    </div>
  );
}
