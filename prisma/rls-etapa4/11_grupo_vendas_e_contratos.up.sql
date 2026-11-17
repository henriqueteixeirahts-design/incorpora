-- RLS Etapa 4 — Grupo 11: Vendas e contratos (5 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 11_grupo_vendas_e_contratos.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- sales — Tier 1 — organizationId
ALTER TABLE public."sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sales" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."sales";
CREATE POLICY tenant_isolation ON public."sales" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- contracts — Tier 1 — organizationId
ALTER TABLE public."contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contracts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."contracts";
CREATE POLICY tenant_isolation ON public."contracts" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- contract_amendments — Tier 1 — organizationId
ALTER TABLE public."contract_amendments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contract_amendments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."contract_amendments";
CREATE POLICY tenant_isolation ON public."contract_amendments" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- contract_assignments — Tier 1 — organizationId
ALTER TABLE public."contract_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contract_assignments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."contract_assignments";
CREATE POLICY tenant_isolation ON public."contract_assignments" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- contract_distratos — Tier 1 — organizationId
ALTER TABLE public."contract_distratos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contract_distratos" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."contract_distratos";
CREATE POLICY tenant_isolation ON public."contract_distratos" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));
