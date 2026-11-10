-- RLS Etapa 4 — REVERSÃO do Grupo 6: Investidores das SPEs
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.

DROP POLICY IF EXISTS tenant_isolation ON public."spe_investors";
ALTER TABLE public."spe_investors" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."spe_investors" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_investor_contribution_forecasts";
ALTER TABLE public."spe_investor_contribution_forecasts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."spe_investor_contribution_forecasts" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_capital_calls";
ALTER TABLE public."spe_capital_calls" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."spe_capital_calls" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_investor_contributions";
ALTER TABLE public."spe_investor_contributions" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."spe_investor_contributions" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_investor_returns";
ALTER TABLE public."spe_investor_returns" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."spe_investor_returns" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_investor_loan_calculations";
ALTER TABLE public."spe_investor_loan_calculations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."spe_investor_loan_calculations" DISABLE ROW LEVEL SECURITY;
