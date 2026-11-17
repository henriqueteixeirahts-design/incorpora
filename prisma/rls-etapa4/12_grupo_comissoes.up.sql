-- RLS Etapa 4 — Grupo 12: Comissões (3 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 12_grupo_comissoes.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- commission_splits — Tier 2 — saleId → sales
ALTER TABLE public."commission_splits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commission_splits" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."commission_splits";
CREATE POLICY tenant_isolation ON public."commission_splits" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."sales" h1 WHERE h1.id = "commission_splits"."saleId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."sales" h1 WHERE h1.id = "commission_splits"."saleId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- external_commission_splits — Tier 2 — saleId → sales
ALTER TABLE public."external_commission_splits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."external_commission_splits" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."external_commission_splits";
CREATE POLICY tenant_isolation ON public."external_commission_splits" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."sales" h1 WHERE h1.id = "external_commission_splits"."saleId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."sales" h1 WHERE h1.id = "external_commission_splits"."saleId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- commission_split_payables — Tier 2 — payableId → payables
ALTER TABLE public."commission_split_payables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commission_split_payables" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."commission_split_payables";
CREATE POLICY tenant_isolation ON public."commission_split_payables" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."payables" h1 WHERE h1.id = "commission_split_payables"."payableId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."payables" h1 WHERE h1.id = "commission_split_payables"."payableId" AND h1."organizationId" = (SELECT public.app_current_org_id())));
