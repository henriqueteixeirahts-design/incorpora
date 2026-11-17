-- RLS Etapa 4 — Grupo 8: Auditoria e trilha (4 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 08_grupo_auditoria_e_trilha.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- audit_events — Tier 1 — organizationId
ALTER TABLE public."audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."audit_events";
CREATE POLICY tenant_isolation ON public."audit_events" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- audit_runs — Tier 1 — organizationId
ALTER TABLE public."audit_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."audit_runs";
CREATE POLICY tenant_isolation ON public."audit_runs" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- audit_check_results — Tier 2 — auditRunId → audit_runs
ALTER TABLE public."audit_check_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_check_results" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."audit_check_results";
CREATE POLICY tenant_isolation ON public."audit_check_results" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."audit_runs" h1 WHERE h1.id = "audit_check_results"."auditRunId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."audit_runs" h1 WHERE h1.id = "audit_check_results"."auditRunId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- notifications — Tier 1 — organizationId
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notifications" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."notifications";
CREATE POLICY tenant_isolation ON public."notifications" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));
