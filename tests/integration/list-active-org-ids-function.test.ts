import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { expectNoSupabaseRoleCanExecute } from "./helpers/supabase-roles";

/**
 * RLS Pilar 2, Etapa 3 — `list_active_org_ids()` (SECURITY DEFINER) é a
 * alternativa a uma role BYPASSRLS separada: roda com o privilégio de quem
 * a criou, não de `app_user` (que a chama aqui, via a conexão normal do
 * app). Ninguém em `src/server/jobs.ts` chama esta função ainda — este
 * teste prova que ela está pronta pro dia em que chamar.
 */

describe("list_active_org_ids() — função SECURITY DEFINER, sem role BYPASSRLS separada", () => {
  it("devolve só organizações ativas, nunca as inativas", async () => {
    const active = await prisma.organization.create({
      data: { name: "Org ativa — teste list_active_org_ids", isActive: true },
    });
    const inactive = await prisma.organization.create({
      data: { name: "Org inativa — teste list_active_org_ids", isActive: false },
    });

    try {
      const rows = await prisma.$queryRawUnsafe<{ list_active_org_ids: string }[]>(
        "SELECT * FROM list_active_org_ids()",
      );
      const ids = rows.map((r) => r.list_active_org_ids);

      expect(ids).toContain(active.id);
      expect(ids).not.toContain(inactive.id);
    } finally {
      await prisma.organization.deleteMany({ where: { id: { in: [active.id, inactive.id] } } });
    }
  });

  it("app_user consegue executar a função (privilégio concedido explicitamente)", async () => {
    const rows = await prisma.$queryRawUnsafe<{ has_function_privilege: boolean }[]>(
      `SELECT has_function_privilege(current_user, 'list_active_org_ids()', 'EXECUTE') AS has_function_privilege`,
    );
    expect(rows[0]?.has_function_privilege).toBe(true);
  });

  it("nenhuma role do PostgREST/Supabase (anon, authenticated, service_role) consegue executar — achado corrigido em produção: o default privilege do Supabase concede EXECUTE em função nova do schema public a essas roles por padrão, REVOKE FROM PUBLIC sozinho não bloqueia isso", async () => {
    // CI (imagem supabase/postgres, EXPECT_SUPABASE_ROLES=1): exige as 3
    // linhas, todas false. Postgres puro local: roles não existem, nada a afirmar.
    await expectNoSupabaseRoleCanExecute("list_active_org_ids()");
  });
});
