import { prisma, recordOperationalAlert } from "@/lib/prisma";

/**
 * Resolução da organização no login (RLS Pilar 2, Etapa 4) — com falha
 * BARULHENTA (2026-11-10).
 *
 * `resolve_user_organization()` (SECURITY DEFINER) devolve o id da
 * organização do vínculo mais antigo, ou nulo. Nulo é normal para quem não
 * tem vínculo — mas, para quem TEM vínculo, é falha da própria resolução
 * (função quebrada, dona da função sem BYPASSRLS depois do FORCE ROW LEVEL
 * SECURITY em access_grants, ...). Antes, os dois casos davam o mesmo
 * resultado: a pessoa voltava para a tela de entrada, sem erro nem alarme,
 * parecendo senha errada.
 *
 * Agora, quando a resolução devolve nulo, `count_user_access_grants()`
 * (outra SECURITY DEFINER, só a contagem) separa os casos, e o caso de falha
 * registra um erro explícito com evento próprio (`login-org-resolution-failed`),
 * fácil de achar no log da Vercel — e GRAVA um alerta em `job_runs`, que a
 * corrente do alerta entrega por e-mail (o log da Vercel no Hobby dura menos
 * de 1 hora; decisão do usuário, 2026-11-10).
 */
export type LoginOrganizationResult =
  | { status: "RESOLVED"; organizationId: string }
  | { status: "NO_GRANT" }
  | { status: "RESOLUTION_FAILED"; grantCount: number };

export const LOGIN_ORG_RESOLUTION_FAILED_EVENT = "login-org-resolution-failed";

type Deps = {
  resolve: (userId: string) => Promise<string | null>;
  countGrants: (userId: string) => Promise<number>;
  logError: (payload: Record<string, unknown>) => void;
  /** Grava o alerta no banco (job_runs) — disparar e esquecer; ver src/lib/operational-alerts.ts. */
  recordAlert: (event: string, callSite: string, message: string) => Promise<void>;
};

const defaultDeps: Deps = {
  async resolve(userId) {
    const [row] = await prisma.$queryRaw<{ organization_id: string | null }[]>`
      SELECT resolve_user_organization(${userId}::uuid) AS organization_id
    `;
    return row?.organization_id ?? null;
  },
  async countGrants(userId) {
    const [row] = await prisma.$queryRaw<{ grants: number }[]>`
      SELECT count_user_access_grants(${userId}::uuid) AS grants
    `;
    return Number(row?.grants ?? 0);
  },
  logError(payload) {
    console.error(JSON.stringify(payload));
  },
  recordAlert: recordOperationalAlert,
};

export async function resolveLoginOrganization(userId: string, deps: Partial<Deps> = {}): Promise<LoginOrganizationResult> {
  const { resolve, countGrants, logError, recordAlert } = { ...defaultDeps, ...deps };
  const organizationId = await resolve(userId);
  if (organizationId) return { status: "RESOLVED", organizationId };

  const grantCount = await countGrants(userId);
  if (grantCount === 0) return { status: "NO_GRANT" };

  const message =
    "resolve_user_organization() devolveu nulo para usuário COM vínculo — login bloqueado. Ver docs/CHECKLIST_POS_DEPLOY_LOGIN.md (rollback).";
  logError({ event: LOGIN_ORG_RESOLUTION_FAILED_EVENT, level: "error", userId, grantCount, message });
  // O log da Vercel (Hobby) dura menos de 1 hora: grava também no banco, para
  // a corrente do alerta entregar. Disparar e esquecer — o login não espera.
  void recordAlert(LOGIN_ORG_RESOLUTION_FAILED_EVENT, `user:${userId}`, `${message} Usuário: ${userId} (${grantCount} vínculo(s)).`);
  return { status: "RESOLUTION_FAILED", grantCount };
}
