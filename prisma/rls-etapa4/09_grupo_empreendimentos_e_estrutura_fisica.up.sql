-- RLS Etapa 4 — Grupo 9: Empreendimentos e estrutura física (10 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 09_grupo_empreendimentos_e_estrutura_fisica.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- developments — Tier 1 — organizationId
ALTER TABLE public."developments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."developments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."developments";
CREATE POLICY tenant_isolation ON public."developments" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- development_events — Tier 1 — organizationId
ALTER TABLE public."development_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."development_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."development_events";
CREATE POLICY tenant_isolation ON public."development_events" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- buildings — Tier 2 — developmentId → developments
ALTER TABLE public."buildings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."buildings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."buildings";
CREATE POLICY tenant_isolation ON public."buildings" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."developments" h1 WHERE h1.id = "buildings"."developmentId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."developments" h1 WHERE h1.id = "buildings"."developmentId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- floors — Tier 3 — buildingId → buildings → developments
ALTER TABLE public."floors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."floors" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."floors";
CREATE POLICY tenant_isolation ON public."floors" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."buildings" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "floors"."buildingId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."buildings" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "floors"."buildingId" AND h2."organizationId" = (SELECT public.app_current_org_id())));

-- units — Tier 2 — developmentId → developments
ALTER TABLE public."units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."units" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."units";
CREATE POLICY tenant_isolation ON public."units" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."developments" h1 WHERE h1.id = "units"."developmentId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."developments" h1 WHERE h1.id = "units"."developmentId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- unit_links — Tier 3 — principalUnitId → units → developments
ALTER TABLE public."unit_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."unit_links" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."unit_links";
CREATE POLICY tenant_isolation ON public."unit_links" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."units" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "unit_links"."principalUnitId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."units" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "unit_links"."principalUnitId" AND h2."organizationId" = (SELECT public.app_current_org_id())));

-- unit_status_history — Tier 3 — unitId → units → developments
ALTER TABLE public."unit_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."unit_status_history" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."unit_status_history";
CREATE POLICY tenant_isolation ON public."unit_status_history" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."units" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "unit_status_history"."unitId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."units" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "unit_status_history"."unitId" AND h2."organizationId" = (SELECT public.app_current_org_id())));

-- construction_phases — Tier 2 — developmentId → developments
ALTER TABLE public."construction_phases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."construction_phases" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."construction_phases";
CREATE POLICY tenant_isolation ON public."construction_phases" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."developments" h1 WHERE h1.id = "construction_phases"."developmentId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."developments" h1 WHERE h1.id = "construction_phases"."developmentId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- construction_measurements — Tier 2 — developmentId → developments
ALTER TABLE public."construction_measurements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."construction_measurements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."construction_measurements";
CREATE POLICY tenant_isolation ON public."construction_measurements" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."developments" h1 WHERE h1.id = "construction_measurements"."developmentId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."developments" h1 WHERE h1.id = "construction_measurements"."developmentId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- construction_phase_measurement_values — Tier 3 — measurementId → construction_measurements → developments
ALTER TABLE public."construction_phase_measurement_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."construction_phase_measurement_values" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."construction_phase_measurement_values";
CREATE POLICY tenant_isolation ON public."construction_phase_measurement_values" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."construction_measurements" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "construction_phase_measurement_values"."measurementId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."construction_measurements" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "construction_phase_measurement_values"."measurementId" AND h2."organizationId" = (SELECT public.app_current_org_id())));
