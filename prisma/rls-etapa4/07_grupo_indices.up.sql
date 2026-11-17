-- RLS Etapa 4 — Grupo 7: Índices (2 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 07_grupo_indices.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- index_rules — Tier 1 — organizationId
ALTER TABLE public."index_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."index_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."index_rules";
CREATE POLICY tenant_isolation ON public."index_rules" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));

-- index_values — Tier 2 — indexRuleId → index_rules
ALTER TABLE public."index_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."index_values" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."index_values";
CREATE POLICY tenant_isolation ON public."index_values" AS PERMISSIVE FOR ALL TO app_user
  USING (EXISTS (SELECT 1 FROM public."index_rules" h1 WHERE h1.id = "index_values"."indexRuleId" AND h1."organizationId" = (SELECT public.app_current_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public."index_rules" h1 WHERE h1.id = "index_values"."indexRuleId" AND h1."organizationId" = (SELECT public.app_current_org_id())));
