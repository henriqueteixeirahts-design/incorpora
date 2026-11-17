import { expect } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * As roles do PostgREST/Supabase (anon, authenticated, service_role) só
 * existem em banco com a imagem do Supabase (produção e o serviço Postgres
 * do CI, que usa `supabase/postgres` desde 2026-11-09). Num Postgres puro
 * (ex.: `postgres:17` local) elas não existem e as checagens de "nenhuma
 * dessas roles tem acesso" não têm o que afirmar.
 *
 * O perigo é o teste passar VAZIO onde deveria checar de verdade. Por isso:
 * com `EXPECT_SUPABASE_ROLES=1` (setado no CI), as 3 roles são OBRIGATÓRIAS
 * — se faltar alguma, o teste falha em vez de virar no-op silencioso.
 * Sem a variável, comportamento tolerante pra Postgres local puro.
 */
export const SUPABASE_ROLES = ["anon", "authenticated", "service_role"] as const;

export function supabaseRolesRequired(): boolean {
  return process.env.EXPECT_SUPABASE_ROLES === "1";
}

/** Roles do Supabase presentes no banco; falha se o ambiente exige as 3 e alguma faltar. */
export async function existingSupabaseRoles(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ rolname: string }[]>(
    `SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') ORDER BY rolname`,
  );
  const names = rows.map((r) => r.rolname);
  if (supabaseRolesRequired()) {
    expect(names, "EXPECT_SUPABASE_ROLES=1 mas o banco não tem as 3 roles do Supabase — imagem errada?").toEqual(
      [...SUPABASE_ROLES].sort(),
    );
  }
  return names;
}

/**
 * Checa que nenhuma role do Supabase tem EXECUTE na função `signature`.
 * Estrito no CI: exige exatamente as 3 linhas, todas false.
 */
export async function expectNoSupabaseRoleCanExecute(signature: string): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{ rolname: string; has_execute: boolean }[]>(
    `SELECT r.rolname, has_function_privilege(r.rolname, $1, 'EXECUTE') AS has_execute
       FROM pg_roles r
      WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
      ORDER BY r.rolname`,
    signature,
  );
  if (supabaseRolesRequired()) {
    expect(rows.map((r) => r.rolname), "as 3 roles do Supabase precisam existir neste ambiente").toEqual(
      [...SUPABASE_ROLES].sort(),
    );
  }
  for (const row of rows) {
    expect(row.has_execute, `${row.rolname} não deveria conseguir executar ${signature}`).toBe(false);
  }
}
