-- RLS Pilar 2, Etapa 3 — correção: `REVOKE ALL ... FROM PUBLIC` na migration
-- anterior (list_active_org_ids) não bastou.
--
-- Achado ao verificar produção logo depois de aplicar a função: `anon`,
-- `authenticated` e `service_role` (as roles do Supabase/PostgREST)
-- tinham EXECUTE na função mesmo assim — o projeto já tem `ALTER DEFAULT
-- PRIVILEGES` concedendo EXECUTE em toda função NOVA do schema `public`
-- pra essas roles (convenção do PostgREST: funções em `public` viram RPC
-- exposto por padrão). `REVOKE ... FROM PUBLIC` não cobre isso — revoga só
-- o privilégio implícito de "qualquer role", não os grants explícitos que
-- o default privilege do Supabase aplica em cima.
--
-- Efeito prático do furo, sem esta correção: `anon` exposto via PostgREST
-- significa que a lista de todos os ids de organização ativa ficaria
-- acessível sem autenticação nenhuma em `/rest/v1/rpc/list_active_org_ids`
-- — baixa sensibilidade (são só ids, não dado de organização), mas
-- nenhuma exposição sem querer é aceitável. Revogado em produção na hora
-- em que foi achado (minutos depois da migration original, antes de
-- qualquer uso real da função em código).
-- `anon`/`authenticated`/`service_role` só existem em ambientes Supabase
-- (produção, staging) — não no Postgres local puro (Docker). DO block
-- condicional pra a migration ser idempotente/reaplicável nos dois tipos
-- de ambiente sem erro.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION list_active_org_ids() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION list_active_org_ids() FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE EXECUTE ON FUNCTION list_active_org_ids() FROM service_role;
  END IF;
END
$$;
