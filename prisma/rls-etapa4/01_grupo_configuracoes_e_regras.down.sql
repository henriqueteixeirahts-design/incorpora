-- RLS Etapa 4 — REVERSÃO do Grupo 1: Configurações e regras
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.

DROP POLICY IF EXISTS tenant_isolation ON public."settings";
ALTER TABLE public."settings" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."settings" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."collection_rules";
ALTER TABLE public."collection_rules" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."collection_rules" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."collection_rule_steps";
ALTER TABLE public."collection_rule_steps" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."collection_rule_steps" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."commission_release_rules";
ALTER TABLE public."commission_release_rules" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."commission_release_rules" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."commission_rules";
ALTER TABLE public."commission_rules" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."commission_rules" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."distrato_rules";
ALTER TABLE public."distrato_rules" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."distrato_rules" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."renegotiation_rules";
ALTER TABLE public."renegotiation_rules" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."renegotiation_rules" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."reservation_rules";
ALTER TABLE public."reservation_rules" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."reservation_rules" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."proposal_evaluation_rules";
ALTER TABLE public."proposal_evaluation_rules" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."proposal_evaluation_rules" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."allocation_templates";
ALTER TABLE public."allocation_templates" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."allocation_templates" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."allocation_template_destinations";
ALTER TABLE public."allocation_template_destinations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."allocation_template_destinations" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."scheduled_reports";
ALTER TABLE public."scheduled_reports" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."scheduled_reports" DISABLE ROW LEVEL SECURITY;
