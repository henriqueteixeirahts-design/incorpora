-- RLS Etapa 4 — REVERSÃO do Grupo 14: Permutas
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.

DROP POLICY IF EXISTS tenant_isolation ON public."permutantes";
ALTER TABLE public."permutantes" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."permutantes" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."exchange_contracts";
ALTER TABLE public."exchange_contracts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."exchange_contracts" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."exchange_contract_lands";
ALTER TABLE public."exchange_contract_lands" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."exchange_contract_lands" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."exchange_contract_financial_terms";
ALTER TABLE public."exchange_contract_financial_terms" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."exchange_contract_financial_terms" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."exchange_contract_financial_units";
ALTER TABLE public."exchange_contract_financial_units" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."exchange_contract_financial_units" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."exchange_apuration_periods";
ALTER TABLE public."exchange_apuration_periods" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."exchange_apuration_periods" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."exchange_repasses";
ALTER TABLE public."exchange_repasses" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."exchange_repasses" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."exchange_retention_releases";
ALTER TABLE public."exchange_retention_releases" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."exchange_retention_releases" DISABLE ROW LEVEL SECURITY;
