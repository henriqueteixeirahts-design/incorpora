import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * RLS Pilar 2 — a checagem mais importante desta sessão inteira, feita
 * direto contra o banco em vez de presumida: a role que a aplicação (e a
 * suíte de testes, rodando com o mesmo `DATABASE_URL`) usa pra se conectar
 * NUNCA pode ter `BYPASSRLS` nem ser superusuário — foi exatamente por não
 * ter checado isso que a Etapa 2.5 existiu (achado: produção conectava
 * como `postgres`, com `BYPASSRLS`, e localmente a role `incorpora` do
 * Docker é superusuário por padrão da imagem oficial).
 *
 * Roda em todo ambiente (local, CI, staging, produção) com o mesmo
 * `DATABASE_URL` — se algum ambiente reintroduzir uma role com bypass
 * (ex.: alguém trocar a env var de volta por engano), este teste falha na
 * hora, em vez de deixar os testes de bypass de RLS (Etapa 4+) darem
 * falso-verde silenciosamente.
 */

describe("Role de conexão da aplicação — nunca BYPASSRLS, nunca superusuário", () => {
  it("a role atual (current_user) não tem BYPASSRLS nem é superusuário", async () => {
    const rows = await prisma.$queryRawUnsafe<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean }[]>(
      `SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.rolbypassrls).toBe(false);
    expect(rows[0]?.rolsuper).toBe(false);
  });

  it("a role atual não é dona de nenhuma tabela em public (dono de tabela também ignora RLS por padrão)", async () => {
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count
       FROM pg_tables t
       JOIN pg_roles r ON r.rolname = t.tableowner
       WHERE t.schemaname = 'public' AND r.rolname = current_user`,
    );

    expect(Number(rows[0]?.count ?? -1)).toBe(0);
  });
});
