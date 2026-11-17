-- RLS Etapa 4 — REVERSÃO do Grupo 12: Comissões
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.

DROP POLICY IF EXISTS tenant_isolation ON public."commission_splits";
ALTER TABLE public."commission_splits" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."commission_splits" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."external_commission_splits";
ALTER TABLE public."external_commission_splits" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."external_commission_splits" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."commission_split_payables";
ALTER TABLE public."commission_split_payables" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."commission_split_payables" DISABLE ROW LEVEL SECURITY;
