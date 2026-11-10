-- RLS Etapa 4 — REVERSÃO do Grupo 16: Carteira de recebíveis
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Idempotente: pode rodar mais de uma vez, e sobre um banco em que o grupo nunca foi ativado.

DROP POLICY IF EXISTS tenant_isolation ON public."receivable_portfolios";
ALTER TABLE public."receivable_portfolios" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."receivable_portfolios" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."installments";
ALTER TABLE public."installments" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."installments" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."installment_payments";
ALTER TABLE public."installment_payments" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."installment_payments" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."financial_calculations";
ALTER TABLE public."financial_calculations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."financial_calculations" DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."receivables";
ALTER TABLE public."receivables" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public."receivables" DISABLE ROW LEVEL SECURITY;
