-- RLS Etapa 4 — REVERSÃO do Grupo 11: Vendas e contratos
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.

DROP POLICY IF EXISTS tenant_isolation ON public."sales";
ALTER TABLE public."sales" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."sales" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."contracts";
ALTER TABLE public."contracts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."contracts" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."contract_amendments";
ALTER TABLE public."contract_amendments" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."contract_amendments" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."contract_assignments";
ALTER TABLE public."contract_assignments" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."contract_assignments" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."contract_distratos";
ALTER TABLE public."contract_distratos" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."contract_distratos" DISABLE ROW LEVEL SECURITY;
