-- RLS Etapa 4 — REVERSÃO do Grupo 10: Comercial: tabela de vendas, reservas, propostas
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.

DROP POLICY IF EXISTS tenant_isolation ON public."sales_tables";
ALTER TABLE public."sales_tables" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."sales_tables" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."sales_table_units";
ALTER TABLE public."sales_table_units" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."sales_table_units" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."reservations";
ALTER TABLE public."reservations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."reservations" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."reservation_waitlist_entries";
ALTER TABLE public."reservation_waitlist_entries" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."reservation_waitlist_entries" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."proposals";
ALTER TABLE public."proposals" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."proposals" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."proposal_approvals";
ALTER TABLE public."proposal_approvals" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."proposal_approvals" DISABLE ROW LEVEL SECURITY;
