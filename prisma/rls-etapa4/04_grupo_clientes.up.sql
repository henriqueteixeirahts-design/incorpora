-- RLS Etapa 4 — Grupo 4: Clientes (2 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 04_grupo_clientes.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- customers — Tier 1 — organizationId
ALTER TABLE public."customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."customers";
CREATE POLICY tenant_isolation ON public."customers" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- customer_contacts — Tier 2 — customerId → customers
ALTER TABLE public."customer_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_contacts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."customer_contacts";
CREATE POLICY tenant_isolation ON public."customer_contacts" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."customers" h1 WHERE h1.id = "customer_contacts"."customerId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."customers" h1 WHERE h1.id = "customer_contacts"."customerId" AND h1."organizationId" = (SELECT public.app_current_org_id())));
