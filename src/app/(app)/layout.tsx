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
          width: 220,
          padding: "1.5rem 1rem",
          borderRight: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <strong style={{ marginBottom: "1rem" }}>Incorpora</strong>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/spes">SPEs</Link>
        <Link href="/users">Usuários</Link>

        <form action={signOutAction} style={{ marginTop: "auto" }}>
          <button type="submit" className="secondary">
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
