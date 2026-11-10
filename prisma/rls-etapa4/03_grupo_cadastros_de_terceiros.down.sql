-- RLS Etapa 4 — REVERSÃO do Grupo 3: Cadastros de terceiros
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.

DROP POLICY IF EXISTS tenant_isolation ON public."suppliers";
ALTER TABLE public."suppliers" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."suppliers" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."cost_centers";
ALTER TABLE public."cost_centers" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."cost_centers" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."bank_accounts";
ALTER TABLE public."bank_accounts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."bank_accounts" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."real_estate_agencies";
ALTER TABLE public."real_estate_agencies" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."real_estate_agencies" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."agency_split_tiers";
ALTER TABLE public."agency_split_tiers" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."agency_split_tiers" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."brokers";
ALTER TABLE public."brokers" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."brokers" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."partnership_agreements";
ALTER TABLE public."partnership_agreements" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."partnership_agreements" DISABLE ROW LEVEL SECURITY;
