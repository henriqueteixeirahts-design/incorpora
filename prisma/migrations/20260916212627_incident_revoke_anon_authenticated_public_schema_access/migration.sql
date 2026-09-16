-- INCIDENTE DE SEGURANÇA — ver docs/STATUS_IMPLANTACAO.md pro registro
-- completo. Achado pelo advisor de segurança do Supabase ("RLS Disabled
-- in Public", ERROR, 91 tabelas) ao verificar produção depois da Etapa 3
-- do Pilar 2 (RLS). Não é uma vulnerabilidade introduzida por essa etapa —
-- é a configuração padrão do Supabase pra um projeto que nunca desligou o
-- Data API (PostgREST): TODA tabela nova do schema `public` nasce com
-- GRANT completo (arwdDxtm — select/insert/update/delete/truncate/
-- references/trigger) pra `anon` e `authenticated`, via `ALTER DEFAULT
-- PRIVILEGES` que o próprio Supabase configura na criação do projeto.
-- Sem RLS (ainda não ativa — só chega na Etapa 4), isso significa: leitura
-- e escrita de toda tabela, pra qualquer um com a anon key, direto via
-- `/rest/v1/...`, sem passar pela aplicação nem pelo Prisma.
--
-- Confirmado antes desta migration: a aplicação nunca usa PostgREST pra
-- dado nenhum (grep completo em src/ — zero uso de `.from()`/`.rpc()` do
-- client do Supabase; os únicos usos do client são `.auth.*` via
-- NEXT_PUBLIC_SUPABASE_ANON_KEY, e `.storage.*` via SUPABASE_SERVICE_ROLE_
-- KEY em src/lib/supabase/admin.ts — nenhum dos dois toca tabela do
-- schema `public`). Todo dado real passa por DATABASE_URL/DIRECT_URL
-- (conexão Postgres direta via Prisma), nunca pelo Data API. Revogar tudo
-- de anon/authenticated/service_role no schema public não quebra nada da
-- aplicação — validado pela suíte completa antes de promover a cada
-- ambiente.
--
-- Local puro (Docker) não tem as roles anon/authenticated/service_role —
-- todo REVOKE delas é condicional (verifica existência antes). O grantor
-- do `ALTER DEFAULT PRIVILEGES` usa `current_user` (dinâmico via EXECUTE),
-- não o nome fixo "postgres" — localmente quem roda a migration é
-- `incorpora`, em Supabase é `postgres`; tem que ser a mesma role que
-- efetivamente cria as tabelas em cada ambiente.
DO $$
DECLARE
  applying_role text := current_user;
BEGIN
  -- 1) USAGE no schema — achado extra: PUBLIC (o pseudo-role "qualquer
  --    role", não só anon/authenticated) tinha USAGE concedido no schema
  --    `public` (`nspacl` continha `=U/pg_database_owner`, o `=` antes do
  --    `U` marca a entrada de PUBLIC). Revogar só de anon/authenticated não
  --    bastaria — PUBLIC cobre qualquer role, presente ou futura,
  --    independente de revoke pontual.
  EXECUTE 'REVOKE USAGE ON SCHEMA public FROM PUBLIC';

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE USAGE ON SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon';
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM anon', applying_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon', applying_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon', applying_role);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE USAGE ON SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM authenticated';
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated', applying_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated', applying_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated', applying_role);
  END IF;

  -- service_role: avaliado e confirmado sem uso pra dado do schema public
  -- (só Storage, que gerencia seu próprio schema à parte) — revogado junto
  -- por menor privilégio, mesmo tendo BYPASSRLS por padrão (BYPASSRLS só
  -- ignora policy de RLS; sem GRANT nenhum na tabela, continua sem acesso
  -- algum a ela).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE USAGE ON SCHEMA public FROM service_role';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM service_role';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM service_role';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM service_role';
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM service_role', applying_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM service_role', applying_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM service_role', applying_role);
  END IF;
END
$$;

-- Existe uma SEGUNDA entrada de default privilege pra tabela/sequence/
-- função de `public`, com grantor `supabase_admin` (setada pelo próprio
-- provisionamento do Supabase, também concedendo tudo a anon/
-- authenticated/service_role) — a role que aplica esta migration (postgres
-- em Supabase) NÃO tem permissão de alterar essa entrada (`ALTER DEFAULT
-- PRIVILEGES FOR ROLE X` exige ser a role X ou ter sido concedida
-- membership nela; postgres não é membro de supabase_admin neste projeto,
-- confirmado via pg_auth_members). Isso é inofensivo na prática: nenhuma
-- tabela deste projeto é criada como supabase_admin — todas as migrations
-- (passadas e futuras) rodam como a role acima, então só a entrada dela é
-- operante pras tabelas de verdade. Coberto por teste
-- (tests/integration/no-public-schema-access-for-anon-authenticated.test.ts):
-- cria uma tabela de teste como a role da migration e confirma que ela
-- nasce SEM grant pra anon/authenticated/service_role.
