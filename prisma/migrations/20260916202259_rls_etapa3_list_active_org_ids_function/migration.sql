-- RLS Pilar 2, Etapa 3 — função SECURITY DEFINER no lugar de uma role
-- BYPASSRLS separada.
--
-- A única leitura cross-tenant do sistema inteiro é listar organizações
-- ativas (usada por `runJobForAllOrganizations` pra decidir pra quais
-- organizações rodar cada job). Em vez de uma segunda credencial/role com
-- BYPASSRLS pra essa única query, uma função SECURITY DEFINER: roda com o
-- privilégio de quem a CRIOU (a role superusuária/DDL de cada ambiente —
-- não fixado aqui por nome, fica implícito em quem aplica a migration),
-- não de quem a CHAMA. `app_user` ganha só permissão de EXECUTAR a
-- função, nunca de ver a tabela `organizations` inteira por conta própria
-- fora dela.
--
-- `SET search_path = public` fixo — mitigação padrão contra sequestro de
-- search_path em função SECURITY DEFINER (sem isso, um `search_path`
-- malicioso na sessão do chamador poderia fazer a função resolver
-- `organizations` pra outro objeto).
--
-- Nenhum código chama esta função ainda (isso fica pra quando
-- src/server/jobs.ts for atualizado, depois da correção paralela do
-- recalculate-installments fechar) — só a função e o grant existem a
-- partir desta migration, sem nenhuma mudança de comportamento.
CREATE FUNCTION list_active_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "id" FROM "organizations" WHERE "isActive" = true;
$$;

REVOKE ALL ON FUNCTION list_active_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_active_org_ids() TO app_user;
