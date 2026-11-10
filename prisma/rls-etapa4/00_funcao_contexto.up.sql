-- RLS Etapa 4 — Grupo 00: função de contexto (pré-requisito de todos os grupos)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Organização do contexto da transação, ou nulo. A aplicação define
-- app.current_org_id com set_config(..., true) (escopo de transação) em toda
-- consulta — ver src/lib/prisma.ts. Sem contexto, a extensão define um
-- placeholder que não corresponde a organização nenhuma: fail-closed.
-- Não é SECURITY DEFINER: roda com o privilégio de quem chama.
CREATE OR REPLACE FUNCTION public.app_current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT nullif(pg_catalog.current_setting('app.current_org_id', true), '')::uuid;
$$;

REVOKE ALL ON FUNCTION public.app_current_org_id() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION public.app_current_org_id() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.app_current_org_id() FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE EXECUTE ON FUNCTION public.app_current_org_id() FROM service_role;
  END IF;
END
$$;
GRANT EXECUTE ON FUNCTION public.app_current_org_id() TO app_user;
