-- RLS Etapa 4 — Grupo 13: Contas a pagar (3 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 13_grupo_contas_a_pagar.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- payables — Tier 1 — organizationId
ALTER TABLE public."payables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payables" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."payables";
CREATE POLICY tenant_isolation ON public."payables" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- payable_items — Tier 2 — payableId → payables
ALTER TABLE public."payable_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payable_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."payable_items";
CREATE POLICY tenant_isolation ON public."payable_items" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."payables" h1 WHERE h1.id = "payable_items"."payableId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."payables" h1 WHERE h1.id = "payable_items"."payableId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- payable_allocations — Tier 2 — payableId → payables
ALTER TABLE public."payable_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payable_allocations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."payable_allocations";
CREATE POLICY tenant_isolation ON public."payable_allocations" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."payables" h1 WHERE h1.id = "payable_allocations"."payableId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."payables" h1 WHERE h1.id = "payable_allocations"."payableId" AND h1."organizationId" = (SELECT public.app_current_org_id())));
