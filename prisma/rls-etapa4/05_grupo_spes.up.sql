-- RLS Etapa 4 — Grupo 5: SPEs (4 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 05_grupo_spes.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- special_purpose_entities — Tier 1 — organizationId
ALTER TABLE public."special_purpose_entities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."special_purpose_entities" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."special_purpose_entities";
CREATE POLICY tenant_isolation ON public."special_purpose_entities" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- spe_bank_accounts — Tier 2 — speId → special_purpose_entities
ALTER TABLE public."spe_bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."spe_bank_accounts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_bank_accounts";
CREATE POLICY tenant_isolation ON public."spe_bank_accounts" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."special_purpose_entities" h1 WHERE h1.id = "spe_bank_accounts"."speId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."special_purpose_entities" h1 WHERE h1.id = "spe_bank_accounts"."speId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- spe_lands — Tier 2 — speId → special_purpose_entities
ALTER TABLE public."spe_lands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."spe_lands" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_lands";
CREATE POLICY tenant_isolation ON public."spe_lands" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."special_purpose_entities" h1 WHERE h1.id = "spe_lands"."speId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."special_purpose_entities" h1 WHERE h1.id = "spe_lands"."speId" AND h1."organizationId" = (SELECT public.app_current_org_id())));

-- spe_partners — Tier 2 — speId → special_purpose_entities
ALTER TABLE public."spe_partners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."spe_partners" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."spe_partners";
CREATE POLICY tenant_isolation ON public."spe_partners" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."special_purpose_entities" h1 WHERE h1.id = "spe_partners"."speId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."special_purpose_entities" h1 WHERE h1.id = "spe_partners"."speId" AND h1."organizationId" = (SELECT public.app_current_org_id())));
