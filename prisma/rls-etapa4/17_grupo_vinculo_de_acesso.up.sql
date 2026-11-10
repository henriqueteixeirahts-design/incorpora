-- RLS Etapa 4 — Grupo 17: Vínculo de acesso (1 tabelas)
-- GERADO por scripts/rls-generate-policies.mjs a partir de
-- docs/RLS_INVENTARIO_TIERS.md + prisma/schema.prisma — não editar à mão.
-- Fica FORA de prisma/migrations: só vai a um banco quando promovido
-- (scripts/rls-promote-group.mjs) ou aplicado pelo CI (scripts/rls-apply-etapa4.mjs).

-- Reversão: 17_grupo_vinculo_de_acesso.down.sql (idempotente).
-- Policy: FOR ALL, TO app_user, mesma expressão em USING e WITH CHECK — leitura,
-- escrita, update e delete só dentro da organização do contexto. FORCE: vale até
-- para a dona da tabela, se um dia ela perder BYPASSRLS.

-- access_grants — Tier 1 — organizationId
ALTER TABLE public."access_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."access_grants" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."access_grants";
CREATE POLICY tenant_isolation ON public."access_grants" AS PERMISSIVE FOR ALL TO app_user
  USING ("organizationId" = (SELECT public.app_current_org_id()))
  WITH CHECK ("organizationId" = (SELECT public.app_current_org_id()));
