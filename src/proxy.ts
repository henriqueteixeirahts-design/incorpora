import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // /api/cron/* usa autenticação própria por CRON_SECRET (ver route.ts) —
    // não tem sessão de usuário, então precisa ficar fora do redirecionamento
    // de login ou a Vercel nunca conseguiria disparar o job agendado.
    "/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
