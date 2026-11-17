-- RLS Etapa 4 — REVERSÃO do Grupo 13: Contas a pagar
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.

DROP POLICY IF EXISTS tenant_isolation ON public."payables";
ALTER TABLE public."payables" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."payables" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."payable_items";
ALTER TABLE public."payable_items" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."payable_items" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."payable_allocations";
ALTER TABLE public."payable_allocations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."payable_allocations" DISABLE ROW LEVEL SECURITY;
