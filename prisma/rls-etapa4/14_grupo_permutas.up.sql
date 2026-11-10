-- RLS Etapa 4 — Grupo 14: Permutas (8 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 14_grupo_permutas.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- permutantes — Tier 1 — organizationId
ALTER TABLE public."permutantes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."permutantes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."permutantes";
CREATE POLICY tenant_isolation ON public."permutantes" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- exchange_contracts — Tier 2 — developmentId → developments
ALTER TABLE public."exchange_contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."exchange_contracts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."exchange_contracts";
CREATE POLICY tenant_isolation ON public."exchange_contracts" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."developments" h1 WHERE h1.id = "exchange_contracts"."developmentId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."developments" h1 WHERE h1.id = "exchange_contracts"."developmentId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- exchange_contract_lands — Tier 3 — exchangeContractId → exchange_contracts → developments
ALTER TABLE public."exchange_contract_lands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."exchange_contract_lands" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."exchange_contract_lands";
CREATE POLICY tenant_isolation ON public."exchange_contract_lands" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."exchange_contracts" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "exchange_contract_lands"."exchangeContractId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."exchange_contracts" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "exchange_contract_lands"."exchangeContractId" AND h2."organizationId" = (SELECT public.app_current_org_id())));

-- exchange_contract_financial_terms — Tier 3 — exchangeContractId → exchange_contracts → developments
ALTER TABLE public."exchange_contract_financial_terms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."exchange_contract_financial_terms" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."exchange_contract_financial_terms";
CREATE POLICY tenant_isolation ON public."exchange_contract_financial_terms" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."exchange_contracts" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "exchange_contract_financial_terms"."exchangeContractId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."exchange_contracts" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "exchange_contract_financial_terms"."exchangeContractId" AND h2."organizationId" = (SELECT public.app_current_org_id())));

-- exchange_contract_financial_units — Tier 3 — unitId → units → developments
ALTER TABLE public."exchange_contract_financial_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."exchange_contract_financial_units" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."exchange_contract_financial_units";
CREATE POLICY tenant_isolation ON public."exchange_contract_financial_units" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."units" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "exchange_contract_financial_units"."unitId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."units" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "exchange_contract_financial_units"."unitId" AND h2."organizationId" = (SELECT public.app_current_org_id())));

-- exchange_apuration_periods — Tier 3 — exchangeContractId → exchange_contracts → developments
ALTER TABLE public."exchange_apuration_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."exchange_apuration_periods" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."exchange_apuration_periods";
CREATE POLICY tenant_isolation ON public."exchange_apuration_periods" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."exchange_contracts" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "exchange_apuration_periods"."exchangeContractId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."exchange_contracts" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "exchange_apuration_periods"."exchangeContractId" AND h2."organizationId" = (SELECT public.app_current_org_id())));

-- exchange_repasses — Tier 3 — exchangeContractId → exchange_contracts → developments
ALTER TABLE public."exchange_repasses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."exchange_repasses" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."exchange_repasses";
CREATE POLICY tenant_isolation ON public."exchange_repasses" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."exchange_contracts" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "exchange_repasses"."exchangeContractId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."exchange_contracts" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "exchange_repasses"."exchangeContractId" AND h2."organizationId" = (SELECT public.app_current_org_id())));

-- exchange_retention_releases — Tier 3 — exchangeContractId → exchange_contracts → developments
ALTER TABLE public."exchange_retention_releases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."exchange_retention_releases" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."exchange_retention_releases";
CREATE POLICY tenant_isolation ON public."exchange_retention_releases" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."exchange_contracts" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "exchange_retention_releases"."exchangeContractId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."exchange_contracts" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "exchange_retention_releases"."exchangeContractId" AND h2."organizationId" = (SELECT public.app_current_org_id())));
