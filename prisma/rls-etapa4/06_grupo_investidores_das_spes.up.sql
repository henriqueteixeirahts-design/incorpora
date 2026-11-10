-- RLS Etapa 4 — Grupo 6: Investidores das SPEs (6 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 06_grupo_investidores_das_spes.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- spe_investors — Tier 2 — speId → special_purpose_entities
ALTER TABLE public."spe_investors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."spe_investors" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_investors";
CREATE POLICY tenant_isolation ON public."spe_investors" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."special_purpose_entities" h1 WHERE h1.id = "spe_investors"."speId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."special_purpose_entities" h1 WHERE h1.id = "spe_investors"."speId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- spe_investor_contribution_forecasts — Tier 3 — investorId → spe_investors → special_purpose_entities
ALTER TABLE public."spe_investor_contribution_forecasts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."spe_investor_contribution_forecasts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_investor_contribution_forecasts";
CREATE POLICY tenant_isolation ON public."spe_investor_contribution_forecasts" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."spe_investors" h1 JOIN public."special_purpose_entities" h2 ON h2.id = h1."speId" WHERE h1.id = "spe_investor_contribution_forecasts"."investorId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."spe_investors" h1 JOIN public."special_purpose_entities" h2 ON h2.id = h1."speId" WHERE h1.id = "spe_investor_contribution_forecasts"."investorId" AND h2."organizationId" = (SELECT public.app_current_org_id())));

-- spe_capital_calls — Tier 3 — forecastId → forecasts → spe_investors → special_purpose_entities
ALTER TABLE public."spe_capital_calls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."spe_capital_calls" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_capital_calls";
CREATE POLICY tenant_isolation ON public."spe_capital_calls" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."spe_investor_contribution_forecasts" h1 JOIN public."spe_investors" h2 ON h2.id = h1."investorId" JOIN public."special_purpose_entities" h3 ON h3.id = h2."speId" WHERE h1.id = "spe_capital_calls"."forecastId" AND h3."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."spe_investor_contribution_forecasts" h1 JOIN public."spe_investors" h2 ON h2.id = h1."investorId" JOIN public."special_purpose_entities" h3 ON h3.id = h2."speId" WHERE h1.id = "spe_capital_calls"."forecastId" AND h3."organizationId" = (SELECT public.app_current_org_id())));

-- spe_investor_contributions — Tier 3 — investorId → spe_investors → special_purpose_entities
ALTER TABLE public."spe_investor_contributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."spe_investor_contributions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_investor_contributions";
CREATE POLICY tenant_isolation ON public."spe_investor_contributions" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."spe_investors" h1 JOIN public."special_purpose_entities" h2 ON h2.id = h1."speId" WHERE h1.id = "spe_investor_contributions"."investorId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."spe_investors" h1 JOIN public."special_purpose_entities" h2 ON h2.id = h1."speId" WHERE h1.id = "spe_investor_contributions"."investorId" AND h2."organizationId" = (SELECT public.app_current_org_id())));

-- spe_investor_returns — Tier 3 — investorId → spe_investors → special_purpose_entities
ALTER TABLE public."spe_investor_returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."spe_investor_returns" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_investor_returns";
CREATE POLICY tenant_isolation ON public."spe_investor_returns" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."spe_investors" h1 JOIN public."special_purpose_entities" h2 ON h2.id = h1."speId" WHERE h1.id = "spe_investor_returns"."investorId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."spe_investors" h1 JOIN public."special_purpose_entities" h2 ON h2.id = h1."speId" WHERE h1.id = "spe_investor_returns"."investorId" AND h2."organizationId" = (SELECT public.app_current_org_id())));

-- spe_investor_loan_calculations — Tier 3 — investorId → spe_investors → special_purpose_entities
ALTER TABLE public."spe_investor_loan_calculations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."spe_investor_loan_calculations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_investor_loan_calculations";
CREATE POLICY tenant_isolation ON public."spe_investor_loan_calculations" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."spe_investors" h1 JOIN public."special_purpose_entities" h2 ON h2.id = h1."speId" WHERE h1.id = "spe_investor_loan_calculations"."investorId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."spe_investors" h1 JOIN public."special_purpose_entities" h2 ON h2.id = h1."speId" WHERE h1.id = "spe_investor_loan_calculations"."investorId" AND h2."organizationId" = (SELECT public.app_current_org_id())));
