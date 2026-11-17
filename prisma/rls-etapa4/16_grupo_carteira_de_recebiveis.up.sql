-- RLS Etapa 4 — Grupo 16: Carteira de recebíveis (5 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 16_grupo_carteira_de_recebiveis.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- receivable_portfolios — Tier 1 — organizationId
ALTER TABLE public."receivable_portfolios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."receivable_portfolios" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."receivable_portfolios";
CREATE POLICY tenant_isolation ON public."receivable_portfolios" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- installments — Tier 2 — portfolioId → receivable_portfolios
ALTER TABLE public."installments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."installments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."installments";
CREATE POLICY tenant_isolation ON public."installments" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."receivable_portfolios" h1 WHERE h1.id = "installments"."portfolioId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."receivable_portfolios" h1 WHERE h1.id = "installments"."portfolioId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- installment_payments — Tier 3 — installmentId → installments → receivable_portfolios
ALTER TABLE public."installment_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."installment_payments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."installment_payments";
CREATE POLICY tenant_isolation ON public."installment_payments" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."installments" h1 JOIN public."receivable_portfolios" h2 ON h2.id = h1."portfolioId" WHERE h1.id = "installment_payments"."installmentId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."installments" h1 JOIN public."receivable_portfolios" h2 ON h2.id = h1."portfolioId" WHERE h1.id = "installment_payments"."installmentId" AND h2."organizationId" = (SELECT public.app_current_org_id())));

-- financial_calculations — Tier 3 — installmentId → installments → receivable_portfolios
ALTER TABLE public."financial_calculations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."financial_calculations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."financial_calculations";
CREATE POLICY tenant_isolation ON public."financial_calculations" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."installments" h1 JOIN public."receivable_portfolios" h2 ON h2.id = h1."portfolioId" WHERE h1.id = "financial_calculations"."installmentId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."installments" h1 JOIN public."receivable_portfolios" h2 ON h2.id = h1."portfolioId" WHERE h1.id = "financial_calculations"."installmentId" AND h2."organizationId" = (SELECT public.app_current_org_id())));

-- receivables — Tier 1 — organizationId
ALTER TABLE public."receivables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."receivables" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."receivables";
CREATE POLICY tenant_isolation ON public."receivables" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));
