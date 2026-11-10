-- RLS Etapa 4 — REVERSÃO do Grupo 9: Empreendimentos e estrutura física
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.

DROP POLICY IF EXISTS tenant_isolation ON public."developments";
ALTER TABLE public."developments" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."developments" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."development_events";
ALTER TABLE public."development_events" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."development_events" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."buildings";
ALTER TABLE public."buildings" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."buildings" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."floors";
ALTER TABLE public."floors" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."floors" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."units";
ALTER TABLE public."units" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."units" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."unit_links";
ALTER TABLE public."unit_links" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."unit_links" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."unit_status_history";
ALTER TABLE public."unit_status_history" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."unit_status_history" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."construction_phases";
ALTER TABLE public."construction_phases" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."construction_phases" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."construction_measurements";
ALTER TABLE public."construction_measurements" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."construction_measurements" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."construction_phase_measurement_values";
ALTER TABLE public."construction_phase_measurement_values" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."construction_phase_measurement_values" DISABLE ROW LEVEL SECURITY;
