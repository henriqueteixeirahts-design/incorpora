-- RLS Pilar 2, preparação da Etapa 4 (2026-11-08) — login sem depender de
-- leitura cross-tenant. `getAccessContext` (src/server/auth-context.ts) lê
-- os vínculos (`access_grants`) do usuário ANTES de saber a organização da
-- sessão — com a policy de `access_grants` ativa, essa leitura (contexto
-- vazio = nenhuma organização) não veria linha nenhuma e ninguém entraria.
--
-- Mesmo desenho de `list_active_org_ids()` (Etapa 3): uma função SECURITY
-- DEFINER mínima, que devolve SÓ o id da organização do usuário (a do
-- vínculo mais antigo — mesma regra "uma organização por sessão" que o
-- código já aplica), e nada mais. Com esse id, a aplicação define o
-- contexto e faz a leitura completa dos vínculos sob a policy normal.
--
-- MUDANÇA DE PRIVILÉGIO EM PRODUÇÃO (GRANT EXECUTE a app_user; REVOKE de
-- PUBLIC/anon/authenticated/service_role) — só vai pra produção com
-- aprovação explícita. Não ativa RLS em tabela nenhuma.
CREATE FUNCTION resolve_user_organization(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "organizationId" FROM "access_grants"
  WHERE "userId" = p_user_id
  ORDER BY "createdAt" ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION resolve_user_organization(uuid) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION resolve_user_organization(uuid) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION resolve_user_organization(uuid) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE EXECUTE ON FUNCTION resolve_user_organization(uuid) FROM service_role;
  END IF;
END
$$;
GRANT EXECUTE ON FUNCTION resolve_user_organization(uuid) TO app_user;
