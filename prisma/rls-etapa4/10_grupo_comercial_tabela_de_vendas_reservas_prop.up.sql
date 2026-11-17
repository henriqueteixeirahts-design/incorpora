-- RLS Etapa 4 — Grupo 10: Comercial: tabela de vendas, reservas, propostas (6 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 10_grupo_comercial_tabela_de_vendas_reservas_prop.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- sales_tables — Tier 2 — developmentId → developments
ALTER TABLE public."sales_tables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sales_tables" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."sales_tables";
CREATE POLICY tenant_isolation ON public."sales_tables" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."developments" h1 WHERE h1.id = "sales_tables"."developmentId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."developments" h1 WHERE h1.id = "sales_tables"."developmentId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- sales_table_units — Tier 3 — salesTableId → sales_tables → developments
ALTER TABLE public."sales_table_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sales_table_units" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."sales_table_units";
CREATE POLICY tenant_isolation ON public."sales_table_units" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."sales_tables" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "sales_table_units"."salesTableId" AND h2."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."sales_tables" h1 JOIN public."developments" h2 ON h2.id = h1."developmentId" WHERE h1.id = "sales_table_units"."salesTableId" AND h2."organizationId" = (SELECT public.app_current_org_id())));

-- reservations — Tier 1 — organizationId
ALTER TABLE public."reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reservations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."reservations";
CREATE POLICY tenant_isolation ON public."reservations" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- reservation_waitlist_entries — Tier 2 — customerId → customers
ALTER TABLE public."reservation_waitlist_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reservation_waitlist_entries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."reservation_waitlist_entries";
CREATE POLICY tenant_isolation ON public."reservation_waitlist_entries" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."customers" h1 WHERE h1.id = "reservation_waitlist_entries"."customerId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."customers" h1 WHERE h1.id = "reservation_waitlist_entries"."customerId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- proposals — Tier 1 — organizationId
ALTER TABLE public."proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."proposals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."proposals";
CREATE POLICY tenant_isolation ON public."proposals" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- proposal_approvals — Tier 2 — proposalId → proposals
ALTER TABLE public."proposal_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."proposal_approvals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."proposal_approvals";
CREATE POLICY tenant_isolation ON public."proposal_approvals" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."proposals" h1 WHERE h1.id = "proposal_approvals"."proposalId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."proposals" h1 WHERE h1.id = "proposal_approvals"."proposalId" AND h1."organizationId" = (SELECT public.app_current_org_id())));
