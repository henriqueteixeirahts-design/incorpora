import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

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
    const rows = await prisma.$queryRawUnsafe<{ rolname: string; has_execute: boolean }[]>(`
      SELECT r.rolname, has_function_privilege(r.rolname, 'list_active_org_ids()', 'EXECUTE') AS has_execute
      FROM pg_roles r
      WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
    `);

    // Em Postgres local puro (Docker) essas roles não existem — a query
    // simplesmente não devolve linha nenhuma, e o teste não tem nada a
    // afirmar. Em ambiente Supabase (staging/produção), toda linha que
    // existir precisa ter has_execute = false.
    for (const row of rows) {
      expect(row.has_execute, `${row.rolname} não deveria conseguir executar list_active_org_ids()`).toBe(false);
    }
  });
});
