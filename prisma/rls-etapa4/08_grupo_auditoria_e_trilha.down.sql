-- RLS Etapa 4 — REVERSÃO do Grupo 8: Auditoria e trilha
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.

DROP POLICY IF EXISTS tenant_isolation ON public."audit_events";
ALTER TABLE public."audit_events" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."audit_events" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."audit_runs";
ALTER TABLE public."audit_runs" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."audit_runs" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."audit_check_results";
ALTER TABLE public."audit_check_results" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."audit_check_results" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."notifications";
ALTER TABLE public."notifications" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."notifications" DISABLE ROW LEVEL SECURITY;
