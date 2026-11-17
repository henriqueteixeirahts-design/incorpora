-- RLS Etapa 4 — Grupo 3: Cadastros de terceiros (7 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 03_grupo_cadastros_de_terceiros.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- suppliers — Tier 1 — organizationId
ALTER TABLE public."suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."suppliers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."suppliers";
CREATE POLICY tenant_isolation ON public."suppliers" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- cost_centers — Tier 1 — organizationId
ALTER TABLE public."cost_centers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cost_centers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."cost_centers";
CREATE POLICY tenant_isolation ON public."cost_centers" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- bank_accounts — Tier 1 — organizationId
ALTER TABLE public."bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."bank_accounts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."bank_accounts";
CREATE POLICY tenant_isolation ON public."bank_accounts" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- real_estate_agencies — Tier 1 — organizationId
ALTER TABLE public."real_estate_agencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."real_estate_agencies" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."real_estate_agencies";
CREATE POLICY tenant_isolation ON public."real_estate_agencies" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- agency_split_tiers — Tier 2 — agencyId → real_estate_agencies
ALTER TABLE public."agency_split_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agency_split_tiers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."agency_split_tiers";
CREATE POLICY tenant_isolation ON public."agency_split_tiers" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."real_estate_agencies" h1 WHERE h1.id = "agency_split_tiers"."agencyId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."real_estate_agencies" h1 WHERE h1.id = "agency_split_tiers"."agencyId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- brokers — Tier 1 — organizationId
ALTER TABLE public."brokers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."brokers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."brokers";
CREATE POLICY tenant_isolation ON public."brokers" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- partnership_agreements — Tier 1 — organizationId
ALTER TABLE public."partnership_agreements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partnership_agreements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."partnership_agreements";
CREATE POLICY tenant_isolation ON public."partnership_agreements" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));
