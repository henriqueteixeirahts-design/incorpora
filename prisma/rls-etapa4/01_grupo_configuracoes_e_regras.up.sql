-- RLS Etapa 4 — Grupo 1: Configurações e regras (12 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 01_grupo_configuracoes_e_regras.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- settings — Tier 1 — organizationId
ALTER TABLE public."settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."settings";
CREATE POLICY tenant_isolation ON public."settings" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- collection_rules — Tier 1 — organizationId
ALTER TABLE public."collection_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."collection_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."collection_rules";
CREATE POLICY tenant_isolation ON public."collection_rules" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- collection_rule_steps — Tier 2 — collectionRuleId → collection_rules
ALTER TABLE public."collection_rule_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."collection_rule_steps" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."collection_rule_steps";
CREATE POLICY tenant_isolation ON public."collection_rule_steps" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."collection_rules" h1 WHERE h1.id = "collection_rule_steps"."collectionRuleId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."collection_rules" h1 WHERE h1.id = "collection_rule_steps"."collectionRuleId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- commission_release_rules — Tier 1 — organizationId
ALTER TABLE public."commission_release_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commission_release_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."commission_release_rules";
CREATE POLICY tenant_isolation ON public."commission_release_rules" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- commission_rules — Tier 1 — organizationId
ALTER TABLE public."commission_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commission_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."commission_rules";
CREATE POLICY tenant_isolation ON public."commission_rules" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- distrato_rules — Tier 1 — organizationId
ALTER TABLE public."distrato_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."distrato_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."distrato_rules";
CREATE POLICY tenant_isolation ON public."distrato_rules" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- renegotiation_rules — Tier 1 — organizationId
ALTER TABLE public."renegotiation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."renegotiation_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."renegotiation_rules";
CREATE POLICY tenant_isolation ON public."renegotiation_rules" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- reservation_rules — Tier 1 — organizationId
ALTER TABLE public."reservation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reservation_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."reservation_rules";
CREATE POLICY tenant_isolation ON public."reservation_rules" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- proposal_evaluation_rules — Tier 1 — organizationId
ALTER TABLE public."proposal_evaluation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."proposal_evaluation_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."proposal_evaluation_rules";
CREATE POLICY tenant_isolation ON public."proposal_evaluation_rules" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- allocation_templates — Tier 1 — organizationId
ALTER TABLE public."allocation_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."allocation_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."allocation_templates";
CREATE POLICY tenant_isolation ON public."allocation_templates" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- allocation_template_destinations — Tier 2 — templateId → allocation_templates
ALTER TABLE public."allocation_template_destinations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."allocation_template_destinations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."allocation_template_destinations";
CREATE POLICY tenant_isolation ON public."allocation_template_destinations" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."allocation_templates" h1 WHERE h1.id = "allocation_template_destinations"."templateId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."allocation_templates" h1 WHERE h1.id = "allocation_template_destinations"."templateId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- scheduled_reports — Tier 1 — organizationId
ALTER TABLE public."scheduled_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."scheduled_reports" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."scheduled_reports";
CREATE POLICY tenant_isolation ON public."scheduled_reports" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));
