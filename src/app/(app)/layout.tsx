import { requireAccessContext } from "@/server/auth-context";
import { signOutAction } from "@/app/login/actions";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "./sidebar";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await requireAccessContext();
  const user = await prisma.user.findUnique({
    where: { id: context.userId },
    select: { fullName: true },
  });

  return (
    <div className="inc-shell">
      <Sidebar
        userName={user?.fullName ?? "Usuário"}
        userRole={context.roleNames.join(", ") || "Sem papel atribuído"}
        signOutAction={signOutAction}
      />
      <div className="inc-main">
        <div className="inc-page">{children}</div>
      </div>
    </div>
  );
}
