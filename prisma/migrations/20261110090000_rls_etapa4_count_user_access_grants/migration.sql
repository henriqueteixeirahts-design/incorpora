-- RLS Pilar 2, preparação da Etapa 4 (2026-11-10) — login com falha
-- BARULHENTA. Se `resolve_user_organization()` devolver nulo para um usuário
-- que TEM vínculo (função quebrada, dona da função sem BYPASSRLS depois do
-- FORCE ROW LEVEL SECURITY em access_grants, etc.), o login hoje só volta
-- para a tela de entrada, sem erro — parece senha errada e some.
--
-- Para distinguir "sem vínculo" (normal) de "tem vínculo e a resolução
-- falhou" (erro) sem ler `access_grants` sob a policy (contexto vazio = zero
-- linhas), esta função devolve SÓ a quantidade de vínculos do usuário.
-- Só é chamada quando a resolução devolve nulo.
--
-- Mesmas travas de resolve_user_organization() e list_active_org_ids():
-- SECURITY DEFINER, search_path vazio com tabela qualificada, um parâmetro
-- uuid, retorno escalar, REVOKE de PUBLIC/anon/authenticated/service_role,
-- EXECUTE só para app_user. Exposição: "o usuário X tem N vínculos" para
-- quem já conecta como app_user — nenhum id de organização.
--
-- MUDANÇA DE PRIVILÉGIO (GRANT EXECUTE a app_user) — só vai para produção
-- com aprovação explícita. Não ativa RLS em tabela nenhuma.
CREATE FUNCTION count_user_access_grants(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer FROM "public"."access_grants" WHERE "userId" = p_user_id;
$$;

REVOKE ALL ON FUNCTION count_user_access_grants(uuid) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION count_user_access_grants(uuid) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION count_user_access_grants(uuid) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE EXECUTE ON FUNCTION count_user_access_grants(uuid) FROM service_role;
  END IF;
END
$$;
GRANT EXECUTE ON FUNCTION count_user_access_grants(uuid) TO app_user;
